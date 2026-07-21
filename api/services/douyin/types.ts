export interface DouyinTokenResponse {
  data?: { access_token: string; refresh_token: string; open_id: string; union_id?: string; expires_in: number };
  access_token?: string; refresh_token?: string; open_id?: string; union_id?: string; expires_in?: number;
  error_code?: number; description?: string;
}

export interface DouyinAccountRecord { id: number; user_id: number | null; open_id: string; union_id: string | null; nickname: string | null; avatar: string | null; expires_at: string; status: string; updated_at: string | null; }
export interface OAuthState { value: string; userId: number; expiresAt: number; }
