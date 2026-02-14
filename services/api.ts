
import { OnboardingPayload, UserData, AgentData } from "../types";
import { DEMO_OTP } from "../constants";

const USERS_KEY = "BBF_MOCK_USERS";
const AGENTS_KEY = "BBF_MOCK_AGENTS";
const API_BASE = "/api";

// Helper to initialize storage from existing JSON structure
const initStorage = () => {
  if (!localStorage.getItem(USERS_KEY)) {
    localStorage.setItem(USERS_KEY, JSON.stringify({}));
  }
  if (!localStorage.getItem(AGENTS_KEY)) {
    localStorage.setItem(AGENTS_KEY, JSON.stringify({}));
  }
};

const requestJson = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    }
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // ignore parse failure and use default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
};

export const api = {
  getRegistry: async () => {
    try {
      return await requestJson<{ users: Record<string, UserData>; agents: Record<string, AgentData> }>("/registry", {
        method: "GET"
      });
    } catch {
      initStorage();
      return {
        users: JSON.parse(localStorage.getItem(USERS_KEY) || "{}"),
        agents: JSON.parse(localStorage.getItem(AGENTS_KEY) || "{}")
      };
    }
  },

  signup: async (userData: Partial<UserData>) => {
    console.log("POST /signup", userData);
    try {
      return await requestJson<UserData>("/signup", {
        method: "POST",
        body: JSON.stringify(userData)
      });
    } catch {
      await new Promise(res => setTimeout(res, 800));
      initStorage();
      
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
      const userId = `u_${Math.random().toString(36).substr(2, 9)}`;
      const newUser: UserData = {
        ...userData as UserData,
        user_id: userId,
        created_at: new Date().toISOString(),
        verified: false,
        verification_method: "otp"
      };
      
      users[userId] = newUser;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      return newUser;
    }
  },

  verifyOtp: async (email: string, otp: string) => {
    console.log("POST /verify-otp", { email, otp });
    try {
      return await requestJson<{ status: string }>("/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, otp })
      });
    } catch {
      await new Promise(res => setTimeout(res, 800));
      
      if (otp === DEMO_OTP) {
        const users = JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
        const userKey = Object.keys(users).find(k => users[k].email === email);
        if (userKey) {
          users[userKey].verified = true;
          localStorage.setItem(USERS_KEY, JSON.stringify(users));
        }
        return { status: "success" };
      }
      throw new Error("Invalid OTP");
    }
  },

  createAgent: async (payload: OnboardingPayload) => {
    console.log("POST /agents", payload);
    try {
      return await requestJson<{ agent_id: string }>("/agents", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    } catch {
      await new Promise(res => setTimeout(res, 1500));
      initStorage();

      const agents = JSON.parse(localStorage.getItem(AGENTS_KEY) || "{}");
      const agentId = `agt_${Math.random().toString(36).substr(2, 9)}`;
      
      const newAgent: AgentData = {
        agent_id: agentId,
        owner_user_id: payload.user.user_id || "unknown",
        status: "active",
        created_at: new Date().toISOString(),
        company_context: payload.agent.company_context!,
        goals: payload.agent.goals!
      };

      agents[agentId] = newAgent;
      localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
      return { agent_id: agentId };
    }
  }
};
