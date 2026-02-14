import path from 'path';
import fs from 'fs/promises';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { randomUUID } from 'crypto';

const USERS_FILE = path.resolve(__dirname, 'users.json');
const AGENTS_FILE = path.resolve(__dirname, 'agents.json');
const DEMO_OTP = '123456';

const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJsonFile = async (filePath: string, data: unknown) => {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
};

const readBody = async (req: any): Promise<any> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const sendJson = (res: any, statusCode: number, data: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

const sendError = (res: any, statusCode: number, message: string) => {
  sendJson(res, statusCode, { message });
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiKey = env.GEMINI_API_KEY || env.API_KEY;

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'bbf-json-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api/')) {
              next();
              return;
            }

            try {
              if (req.method === 'GET' && req.url === '/api/registry') {
                const users = await readJsonFile<Record<string, any>>(USERS_FILE, {});
                const agents = await readJsonFile<Record<string, any>>(AGENTS_FILE, {});
                sendJson(res, 200, { users, agents });
                return;
              }

              if (req.method === 'POST' && req.url === '/api/signup') {
                const userData = await readBody(req);
                const users = await readJsonFile<Record<string, any>>(USERS_FILE, {});
                const userId = `u_${randomUUID()}`;
                const newUser = {
                  ...userData,
                  user_id: userId,
                  created_at: new Date().toISOString(),
                  verified: false,
                  verification_method: 'otp',
                };

                users[userId] = newUser;
                await writeJsonFile(USERS_FILE, users);
                sendJson(res, 200, newUser);
                return;
              }

              if (req.method === 'POST' && req.url === '/api/verify-otp') {
                const { email, otp } = await readBody(req);
                if (otp !== DEMO_OTP) {
                  sendError(res, 400, 'Invalid OTP');
                  return;
                }

                const users = await readJsonFile<Record<string, any>>(USERS_FILE, {});
                const userKey = Object.keys(users).find((key) => users[key]?.email === email);
                if (userKey) {
                  users[userKey].verified = true;
                  await writeJsonFile(USERS_FILE, users);
                }
                sendJson(res, 200, { status: 'success' });
                return;
              }

              if (req.method === 'POST' && req.url === '/api/agents') {
                const payload = await readBody(req);
                const agents = await readJsonFile<Record<string, any>>(AGENTS_FILE, {});
                const agentId = `agt_${randomUUID().slice(0, 8)}`;
                const newAgent = {
                  agent_id: agentId,
                  owner_user_id: payload?.user?.user_id || 'unknown',
                  status: 'active',
                  created_at: new Date().toISOString(),
                  company_context: payload?.agent?.company_context || {},
                  goals: payload?.agent?.goals || {},
                };

                agents[agentId] = newAgent;
                await writeJsonFile(AGENTS_FILE, agents);
                sendJson(res, 200, { agent_id: agentId });
                return;
              }

              sendError(res, 404, 'Not found');
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unexpected server error';
              sendError(res, 500, message);
            }
          });
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
