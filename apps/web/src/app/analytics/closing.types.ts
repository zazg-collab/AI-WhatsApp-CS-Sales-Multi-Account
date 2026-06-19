export interface FunnelStage {
  stage: string;
  population: number;
  resolvedConversations: number;
  conversionRate: number;
}

export interface FunnelTransitionDay {
  date: string;
  upgrades: number;
  downgrades: number;
}

export interface FunnelConversion {
  rangeDays: number;
  stages: FunnelStage[];
  transitions: { upgrades: number; downgrades: number; velocity: FunnelTransitionDay[] };
  closeRate: number;
  totalCustomers: number;
  closingCustomers: number;
}

export interface BotAttribution {
  botId: string;
  botName: string;
  personaName: string | null;
  totalConversations: number;
  resolvedConversations: number;
  resolutionRate: number;
  hotLeads: number;
  hotLeadRate: number;
  avgLeadScore: number;
  avgCsat: number | null;
  csatResponses: number;
  aiMessages: number;
}

export interface BotAttributionResult {
  rangeDays: number;
  bots: BotAttribution[];
}

export interface WinLossDay {
  date: string;
  wins: number;
  losses: number;
}

export interface WinLoss {
  rangeDays: number;
  wins: number;
  losses: number;
  slaLosses: number;
  winRate: number;
  total: number;
  topWinLabels: { label: string; count: number }[];
  topLossLabels: { label: string; count: number }[];
  daily: WinLossDay[];
}
