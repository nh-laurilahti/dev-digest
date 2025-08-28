# OpenAI Chat Completions API Specification

## Latest API Reference (as of August 2025)

### Endpoint
```
POST https://api.openai.com/v1/chat/completions
```

### Headers
```json
{
  "Authorization": "Bearer $OPENAI_API_KEY",
  "Content-Type": "application/json"
}
```

### Request Parameters

#### Core Parameters
- **model** (string, required): ID of the model to use (e.g., "gpt-4o-mini", "gpt-4o", "gpt-5-mini")
- **messages** (array, required): List of messages comprising the conversation
- **stream** (boolean, optional): If true, partial message deltas will be sent as server-sent events

#### Token Control
- **max_completion_tokens** (integer, optional): Maximum number of tokens that can be generated in the chat completion
- **max_tokens** (deprecated): Use max_completion_tokens instead

#### Response Control
- **temperature** (number, optional): Sampling temperature between 0 and 2. Note: some models only support default value of 1
- **top_p** (number, optional): Alternative to temperature for nucleus sampling
- **n** (integer, optional): Number of chat completion choices to generate
- **stop** (string or array, optional): Up to 4 sequences where the API will stop generating tokens

#### Advanced Parameters
- **presence_penalty** (number, optional): Between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far
- **frequency_penalty** (number, optional): Between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency
- **logit_bias** (map, optional): Modify the likelihood of specified tokens appearing in the completion
- **user** (string, optional): A unique identifier representing your end-user
- **seed** (integer, optional): For deterministic outputs (beta feature)
- **tools** (array, optional): List of tools the model may call
- **tool_choice** (string/object, optional): Controls which (if any) tool is called by the model
- **parallel_tool_calls** (boolean, optional): Whether to enable parallel function calling

#### Response Format
- **response_format** (object, optional): Format of the response. Can be {"type": "text"} or {"type": "json_object"}

### Streaming Implementation

For streaming responses, set `"stream": true` and handle server-sent events:

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-5-mini',
    messages: [...],
    stream: true,
    max_completion_tokens: 2000,
    temperature: 1
  })
});

// Handle streaming response
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices[0]?.delta?.content;
        if (delta) {
          // Process streaming content
          process.stdout.write(delta);
        }
      } catch (e) {
        // Handle parsing errors
      }
    }
  }
}
```

### Model-Specific Requirements

#### gpt-5-mini
- Only supports `temperature: 1` (default)
- Use `max_completion_tokens` instead of `max_tokens`
- Supports streaming
- Cost-effective for simple tasks

#### gpt-4o / gpt-4o-mini
- Support full parameter range
- Advanced reasoning capabilities
- Vision capabilities (with image inputs)

### Error Handling

Common error codes:
- **400**: Invalid request parameters
- **401**: Invalid API key
- **403**: Forbidden
- **429**: Rate limit exceeded or insufficient quota
- **500**: Server error

### Rate Limits

- **Requests per minute (RPM)**: Varies by model and tier
- **Tokens per minute (TPM)**: Varies by model and tier
- **Tokens per day (TPD)**: May apply to free tier

Rate limit headers are returned:
- `x-ratelimit-limit-requests`
- `x-ratelimit-remaining-requests`
- `x-ratelimit-reset-requests`