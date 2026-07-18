import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";

export interface BedrockConverseClient {
  converse(input: ConverseCommandInput): Promise<ConverseCommandOutput>;
}

export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-6";

export function toBedrockTools(tools: AgentTool[]): Tool[] {
  return tools.map((tool) => ({
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: { json: tool.input_schema },
    },
  }) as Tool);
}

/** Uses AWS_BEARER_TOKEN_BEDROCK, IAM roles, or the standard AWS credential chain. */
export function createBedrockClient(): BedrockConverseClient {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? "us-east-1",
  });

  return {
    converse: (input) => client.send(new ConverseCommand(input)),
  };
}
