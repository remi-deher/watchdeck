export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  detail?: string | Record<string, any>;
  message?: string;
  [key: string]: any;
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  silent?: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
  query?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}
