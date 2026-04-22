const { app } = require('@azure/functions');
const { createClient } = require('@supabase/supabase-js');

app.http('validate-task', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request) => {
        const authHeader = request.headers.get('authorization');
        if (!authHeader) {
            return { status: 401, body: 'Non authentifie' };
        }

        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (!token || token.split('.').length !== 3) {
            return { status: 401, jsonBody: { error: 'Token invalide' } };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const body = await request.json();
        const { project_id, title, due_date, assigned_to } = body ?? {};
        const errors = [];

        if (!title || title.trim().length < 3) {
            errors.push('Le titre doit faire au moins 3 caracteres');
        }

        if (title?.length > 200) {
            errors.push('Le titre ne peut pas depasser 200 caracteres');
        }

        if (due_date && new Date(due_date) < new Date()) {
            errors.push("La date d'echeance ne peut pas etre dans le passe");
        }

        if (assigned_to) {
            const { data: membership } = await supabase
                .from('project_members')
                .select('user_id')
                .eq('project_id', project_id)
                .eq('user_id', assigned_to)
                .single();

            if (!membership) {
                errors.push("L'utilisateur assigne n'est pas membre du projet");
            }
        }

        if (errors.length > 0) {
            return { status: 400, jsonBody: { valid: false, errors } };
        }

        const {
            data: { user },
            error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return { status: 401, jsonBody: { error: 'Utilisateur non authentifie' } };
        }

        const { data: task, error } = await supabase
            .from('tasks')
            .insert({
                project_id,
                title: title.trim(),
                due_date,
                assigned_to,
                created_by: user?.id
            })
            .select()
            .single();

        if (error) {
            return { status: 500, jsonBody: { error: error.message } };
        }

        return { status: 201, jsonBody: { valid: true, task } };
    }
});