UPDATE public.standards SET organization = CASE
  WHEN title = 'Agent2Agent Protocol' THEN 'Google'
  WHEN title = 'Model Context Protocol' THEN 'Anthropic'
  WHEN title = 'AGENTS.md' THEN 'Community'
  WHEN title = 'Agent Communication Protocol' THEN 'Linux Foundation'
  WHEN title = 'Agent-User Interaction Protocol' THEN 'AG-UI'
  WHEN title = 'Agent Client Protocol' THEN 'Wild Card AI'
  WHEN title = 'Agent Payments Protocol' THEN 'Stripe'
  WHEN title = 'Cross App Access' THEN 'Community'
  WHEN title = 'x402 Extension for A2A' THEN 'Community'
  WHEN title = 'agents.json' THEN 'Community'
  WHEN title = 'llms.txt' THEN 'Community'
  WHEN title = 'Agent Commerce Kit' THEN 'Shopify'
END;