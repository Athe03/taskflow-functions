// Point d'entrée unique — modèle de programmation v4 (@azure/functions).
// Chaque module enregistre ses routes via app.http().
require('./functions/notify-assigned');
require('./functions/validate-task');
require('./functions/project-stats');
require('./functions/manage-members');