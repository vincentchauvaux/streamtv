export type EpgProgram = {
  id: string;
  channelId: string;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  category?: string | null;
  channel?: {
    id: string;
    name: string;
    logo?: string | null;
    group?: string | null;
  };
};
