const { app } = require('@azure/functions');
const { createClient } = require('@supabase/supabase-js');

app.http('project-stats', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request) => {
        const projectId = request.query.get('project_id');
        if (!projectId) {
            return { status: 400, body: 'project_id requis' };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data: allTasks } = await supabase
            .from('tasks')
            .select('status, due_date, assigned_to')
            .eq('project_id', projectId);

        const statusCount = (allTasks ?? []).reduce((acc, task) => {
            acc[task.status] = (acc[task.status] ?? 0) + 1;
            return acc;
        }, {});

        const today = new Date().toISOString().split('T')[0];
        const overdueCount = (allTasks ?? []).filter(
            (task) => task.due_date && task.due_date < today && task.status !== 'done'
        ).length;

        const uniqueMembers = new Set(
            (allTasks ?? []).map((task) => task.assigned_to).filter(Boolean)
        ).size;

        const total = allTasks?.length ?? 0;
        const done = statusCount.done ?? 0;

        return {
            status: 200,
            jsonBody: {
                total_tasks: total,
                completion_rate: total > 0 ? Math.round((done / total) * 100) : 0,
                by_status: statusCount,
                overdue_count: overdueCount,
                active_members: uniqueMembers
            }
        };
    }
});