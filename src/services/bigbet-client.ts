import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

export interface RegistrationRecord {
  playerId: string;
  day: number;
  month: number;
  year: number;
  externalAt: string;
  trackingCode: string;
  afp: string;
  status: string;
  qualificationDate: string;
  playerCountry: string;
  ngr: number | null;
  ggr: number | null;
  firstDeposit: number | null;
  firstDepositDate: string;
  netDeposits: number | null;
  depositCount: number;
  affiliateCommissions: number | null;
  wagering: number | null;
}

export interface ActivityRecord {
  playerId: string;
  day: number;
  month: number;
  year: number;
  deposits: number | null;
  depositCount: number;
  withdrawals: number | null;
  netDeposits: number | null;
  commissions: number | null;
  commissionCount: number;
  ngr: number | null;
  ggr: number | null;
  positionCount: number;
  wagering: number | null;
}

export class BigBetClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    const jar = new CookieJar();
    this.client = wrapper(
      axios.create({
        baseURL: baseUrl,
        jar,
        withCredentials: true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        maxRedirects: 5,
      }),
    );
  }

  async login(email: string, password: string): Promise<void> {
    const csrfRes = await this.client.get('/api/auth/csrf');
    const csrfToken: string = csrfRes.data.csrfToken;

    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF token');
    }

    const params = new URLSearchParams({
      email,
      password,
      redirect: 'false',
      csrfToken,
      callbackUrl: `${this.baseUrl}/`,
      json: 'true',
    });

    const loginRes = await this.client.post(
      '/api/auth/callback/credentials',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (loginRes.status !== 200 || !loginRes.data?.url) {
      throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
    }

    const sessionRes = await this.client.get('/api/auth/session');
    if (!sessionRes.data?.user) {
      throw new Error('Session invalid after login');
    }

    console.log(`  Logged in as ${sessionRes.data.user.name} (${sessionRes.data.user.email})`);
  }

  async fetchRegistrations(from: string, to: string): Promise<RegistrationRecord[]> {
    const res = await this.client.get('/api/reports/registration', {
      params: { from, to },
    });

    if (!Array.isArray(res.data)) {
      throw new Error(`Unexpected response: ${JSON.stringify(res.data).slice(0, 200)}`);
    }

    return res.data as RegistrationRecord[];
  }

  async fetchActivity(from: string, to: string): Promise<ActivityRecord[]> {
    const res = await this.client.get('/api/reports/activity', {
      params: { from, to },
    });

    if (!Array.isArray(res.data)) {
      throw new Error(`Unexpected activity response: ${JSON.stringify(res.data).slice(0, 200)}`);
    }

    return res.data as ActivityRecord[];
  }
}
