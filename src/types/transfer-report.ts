export type TransferOutcome = "transferred" | "failed" | "unmatched" | "ambiguous" | "unchanged";
export type TransferReportItem = {
  id: string;
  name: string;
  type: string;
  seriesName?: string;
  year?: number;
  season?: number;
  episode?: number;
  outcome: TransferOutcome | "pending";
  reason: string;
  data: { Played: boolean; IsFavorite: boolean; PlayCount: number; PlaybackPositionTicks: number; LastPlayedDate: string | null };
};
export type TransferReportPage = {
  items: TransferReportItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: { transferred: number; notTransferred: number; unchanged: number };
};
