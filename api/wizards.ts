export default function handler(req: any, res: any) {
  res.json({
    currentWizard: {
      id: 'wizard-starter',
      projectKey: 'default-project',
      name: '',
      description: '',
      version: '1.0.0',
      defaultTool: 'No default tool',
      knowledgeFiles: [],
      disableKnowledgeCitations: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branding: {
        primaryColor: '#4f46e5',
        secondaryColor: '#f8fafc',
        borderRadius: '16px',
        fontFamily: 'Inter, sans-serif',
      },
      steps: [{ id: 'step-1', title: 'Instructions', description: '', type: 'ai-prompt', content: '', placeholder: '', required: true }],
    },
  });
}