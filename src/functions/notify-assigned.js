const { app } = require('@azure/functions');
const { Resend } = require('resend');

// Initialisation des clés depuis les variables d'environnement
const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * Récupère l'email et le profil de l'utilisateur via l'API Admin de Supabase
 */
async function getUserInfo(userId) {
    // 1. Récupérer l'email (Auth Admin API)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        headers: { 
            apikey: SUPABASE_KEY, 
            Authorization: `Bearer ${SUPABASE_KEY}` 
        }
    });
    const user = await userRes.json();

    // 2. Récupérer les infos du profil (Table profiles)
    const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=username,full_name`,
        { 
            headers: { 
                apikey: SUPABASE_KEY, 
                Authorization: `Bearer ${SUPABASE_KEY}` 
            } 
        }
    );
    const [profile] = await profileRes.json();

    return { email: user.email, ...profile };
}

/**
 * Insère une notification dans la table SQL 'notifications'
 */
async function insertNotification(userId, type, title, body, metadata) {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify({ user_id: userId, type, title, body, metadata }),
    });
}

// Définition de la fonction Azure
app.http('notify-assigned', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const payload = await request.json();

            // On n'écoute que les événements UPDATE de Supabase
            if (!payload || payload.type !== 'UPDATE') {
                return { status: 200, body: 'ignored' };
            }

            const { record, old_record } = payload;
            const newAssignee = record?.assigned_to;
            const oldAssignee = old_record?.assigned_to;

            // On vérifie si quelqu'un vient d'être assigné
            if (!newAssignee || newAssignee === oldAssignee) {
                return { status: 200, body: 'no new assignment' };
            }

            // 1. Récupérer les infos de la personne assignée
            const assignee = await getUserInfo(newAssignee);

            // 2. Envoyer l'email via Resend
            await resend.emails.send({
                from: 'TaskFlow <notifications@resend.dev>',
                to: [assignee.email],
                subject: `[TaskFlow] Nouvelle tâche : ${record.title}`,
                html: `<h2>Bonjour ${assignee.full_name ?? assignee.username},</h2>
                       <p>Une nouvelle tâche vous a été assignée : <strong>${record.title}</strong></p>
                       <p>Priorité : ${record.priority}</p>`,
            });

            // 3. Enregistrer la notification dans la DB
            await insertNotification(
                newAssignee, 
                'task_assigned',
                `Nouvelle tâche : ${record.title}`,
                `Priorité ${record.priority}`,
                { task_id: record.id, project_id: record.project_id }
            );

            return { status: 200, jsonBody: { ok: true } };

        } catch (err) {
            context.error(`Erreur notification : ${err.message}`);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});