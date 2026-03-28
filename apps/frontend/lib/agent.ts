import { apiClient } from './api/client';
import { API_ENDPOINTS } from './api/endpoints';

// USAGE NOTE: Uses Python orchestrator via POST /agent/kaivo/act.
// Node orchestrator is inactive/dead code. Do not wire to dispatcher.js.

export interface AgentResponse {
    agent_id: string;
    tool_calls: unknown[];
    explanation: string;
    ui_hints?: Record<string, unknown>;
    new_context_id?: string;
    // AI extraction data
    extracted_data?: {
        campaign_name?: string;
        budget?: number;
        goal?: string;
        goal_type?: string;
        platforms?: string[];
        geo?: string[];
        languages?: string[];
        interests?: string[];
        description?: string;
    };
    created_resources?: {
        audience_id?: number;
        plan_id?: number;
        campaign_id?: number;
    };
    ai_insights?: string[];
}

export interface AskKaivoOptions {
    contextId?: string;
    media_url?: string;
    media_type?: string;
    audience_id?: number;
    client_id?: number;
}

export async function askKaivo(message: string, options?: AskKaivoOptions): Promise<AgentResponse> {
    try {
        const body: Record<string, unknown> = {
            user_id: 'user_123', // TODO: Get from session
            session_id: 'session_123', // TODO: Get from session
            user_message: message,
            context_id: options?.contextId,
            media_url: options?.media_url,
            media_type: options?.media_type
        };
        if (options?.audience_id && options?.client_id) {
            body.slots = { audience_id: options.audience_id, client_id: options.client_id };
        }
        const response = await apiClient.post<AgentResponse>(API_ENDPOINTS.AGENT.ACT, body);
        return response;
    } catch (error) {
        console.error('Error asking Kaivo:', error);
        throw error;
    }
}
