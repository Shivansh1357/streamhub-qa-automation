/**
 * Suggestion backend on the official Anthropic SDK. Structured outputs (messages.parse + zodOutputFormat)
 * make the JSON contract a hard guarantee instead of a prompt request. Credentials come from the
 * environment (ANTHROPIC_API_KEY); the key is never read, printed or logged by this module.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { CandidatesSchema, SYSTEM_PROMPT, buildUserPrompt, normaliseCandidates } from './prompt';
import type { HealingInput, LocatorProvider, ProviderResult } from './types';

export class AnthropicProvider implements LocatorProvider {
  readonly name = 'anthropic';
  private readonly client = new Anthropic();

  async suggest(input: HealingInput): Promise<ProviderResult> {
    const started = Date.now();
    try {
      const response = await this.client.messages.parse({
        model: input.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
        output_config: { format: zodOutputFormat(CandidatesSchema) },
      });
      const warnings: string[] = [];
      if (response.stop_reason === 'refusal')
        warnings.push('The model refused the request (stop_reason=refusal).');
      if (response.stop_reason === 'max_tokens') warnings.push('The answer was cut off at max_tokens.');
      const candidates = response.parsed_output
        ? normaliseCandidates(response.parsed_output, warnings)
        : (warnings.push('The SDK could not parse the structured output; zero candidates.'), []);
      return {
        candidates,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? undefined,
          durationMs: Date.now() - started,
        },
        warnings,
      };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error(
          'Anthropic rejected the credentials (401): set a valid ANTHROPIC_API_KEY, or use --provider claude-cli | offline.',
          { cause: error },
        );
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new Error('Anthropic rate limit reached (429): retry later or lower --max-failures.', {
          cause: error,
        });
      }
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API error${error.status ? ` ${error.status}` : ''}: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
