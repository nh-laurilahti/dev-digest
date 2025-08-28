import { vi } from 'vitest';

export interface MockSlackClient {
  chat: {
    postMessage: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  auth: {
    test: ReturnType<typeof vi.fn>;
  };
  conversations: {
    list: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  users: {
    list: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
}

export const createMockSlackClient = (): MockSlackClient => {
  return {
    chat: {
      postMessage: vi.fn().mockImplementation(async (options) => {
        // Simulate successful message posting
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
        
        return {
          ok: true,
          channel: options.channel,
          ts: `${Date.now()}.${Math.random().toString(36).substr(2, 6)}`,
          message: {
            type: 'message',
            subtype: 'bot_message',
            text: options.text,
            user: 'B1234567890',
            ts: `${Date.now()}.${Math.random().toString(36).substr(2, 6)}`,
            team: 'T1234567890',
            bot_id: 'B1234567890',
            blocks: options.blocks,
            attachments: options.attachments,
          },
        };
      }),
      update: vi.fn().mockResolvedValue({
        ok: true,
        channel: 'C1234567890',
        ts: '1234567890.123456',
      }),
      delete: vi.fn().mockResolvedValue({
        ok: true,
        channel: 'C1234567890',
        ts: '1234567890.123456',
      }),
    },
    auth: {
      test: vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://test-workspace.slack.com/',
        team: 'Test Workspace',
        user: 'dailydevdigest',
        team_id: 'T1234567890',
        user_id: 'U1234567890',
        bot_id: 'B1234567890',
      }),
    },
    conversations: {
      list: vi.fn().mockResolvedValue({
        ok: true,
        channels: [
          {
            id: 'C1234567890',
            name: 'general',
            is_channel: true,
            is_group: false,
            is_im: false,
            is_mpim: false,
            is_private: false,
            created: 1234567890,
            is_archived: false,
            is_general: true,
            unlinked: 0,
            name_normalized: 'general',
            is_shared: false,
            is_ext_shared: false,
            is_org_shared: false,
            pending_shared: [],
            pending_connected_team_ids: [],
            is_pending_ext_shared: false,
            is_member: true,
            is_open: true,
            topic: {
              value: 'General discussion',
              creator: 'U1234567890',
              last_set: 1234567890,
            },
            purpose: {
              value: 'Company-wide announcements and work-based matters',
              creator: 'U1234567890',
              last_set: 1234567890,
            },
            num_members: 10,
          },
          {
            id: 'C0987654321',
            name: 'dev-updates',
            is_channel: true,
            is_private: false,
            is_member: true,
            topic: {
              value: 'Development updates and notifications',
              creator: 'U1234567890',
              last_set: 1234567890,
            },
          },
        ],
      }),
      info: vi.fn().mockImplementation(async (options) => {
        return {
          ok: true,
          channel: {
            id: options.channel,
            name: options.channel === 'C1234567890' ? 'general' : 'dev-updates',
            is_channel: true,
            is_private: false,
            is_member: true,
            created: 1234567890,
            topic: {
              value: 'Test channel',
              creator: 'U1234567890',
              last_set: 1234567890,
            },
          },
        };
      }),
    },
    users: {
      list: vi.fn().mockResolvedValue({
        ok: true,
        members: [
          {
            id: 'U1234567890',
            name: 'testuser',
            real_name: 'Test User',
            profile: {
              email: 'testuser@example.com',
              display_name: 'Test User',
              real_name: 'Test User',
              image_72: 'https://example.com/avatar.jpg',
            },
            is_bot: false,
            deleted: false,
          },
          {
            id: 'B1234567890',
            name: 'dailydevdigest',
            real_name: 'Daily Dev Digest Bot',
            profile: {
              display_name: 'Daily Dev Digest',
              real_name: 'Daily Dev Digest Bot',
            },
            is_bot: true,
            deleted: false,
          },
        ],
      }),
      info: vi.fn().mockImplementation(async (options) => {
        return {
          ok: true,
          user: {
            id: options.user,
            name: 'testuser',
            real_name: 'Test User',
            profile: {
              email: 'testuser@example.com',
              display_name: 'Test User',
              real_name: 'Test User',
            },
            is_bot: false,
          },
        };
      }),
    },
  };
};

export const mockSlackBlocks = {
  digestNotification: [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Daily Development Digest',
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: '*Repository:*\ntestuser/test-repo',
        },
        {
          type: 'mrkdwn',
          text: '*Period:*\nDec 1, 2023 - Dec 2, 2023',
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Summary*\nDaily digest summary content goes here.',
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: '*Pull Requests:* 5',
        },
        {
          type: 'mrkdwn',
          text: '*Contributors:* 3',
        },
        {
          type: 'mrkdwn',
          text: '*Lines Changed:* +150 -50',
        },
      ],
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Recent Pull Requests*',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '• <https://github.com/testuser/test-repo/pull/42|#42 Add amazing feature> by @contributor\n• <https://github.com/testuser/test-repo/pull/41|#41 Fix critical bug> by @maintainer',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Repository',
          },
          url: 'https://github.com/testuser/test-repo',
          style: 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Configure Digest',
          },
          url: 'https://dailydevdigest.com/repositories/1',
        },
      ],
    },
  ],
  
  errorNotification: [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 Digest Generation Error',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Repository:* testuser/test-repo\n*Error:* Unable to fetch pull requests from GitHub API',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Please check your repository configuration and GitHub API access.',
      },
    },
  ],
};

export const mockSlackService = {
  sendDigestNotification: vi.fn().mockImplementation(async (channel, digestData) => {
    const client = createMockSlackClient();
    return await client.chat.postMessage({
      channel,
      text: `Daily Development Digest for ${digestData.repositoryName}`,
      blocks: mockSlackBlocks.digestNotification,
    });
  }),

  sendErrorNotification: vi.fn().mockImplementation(async (channel, error) => {
    const client = createMockSlackClient();
    return await client.chat.postMessage({
      channel,
      text: `Error: ${error.message}`,
      blocks: mockSlackBlocks.errorNotification,
    });
  }),

  testConnection: vi.fn().mockImplementation(async () => {
    const client = createMockSlackClient();
    return await client.auth.test();
  }),

  listChannels: vi.fn().mockImplementation(async () => {
    const client = createMockSlackClient();
    return await client.conversations.list();
  }),

  getChannelInfo: vi.fn().mockImplementation(async (channelId) => {
    const client = createMockSlackClient();
    return await client.conversations.info({ channel: channelId });
  }),
};

// Slack webhook simulation
export const mockSlackWebhook = {
  url: 'https://hooks.slack.com/services/T1234567890/B1234567890/mockwebhooktoken123',
  send: vi.fn().mockImplementation(async (payload) => {
    // Simulate webhook delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      status: 200,
      statusText: 'OK',
      data: 'ok',
    };
  }),
};

// Slack rate limiting simulation
export const mockSlackRateLimit = {
  tier: 'tier2',
  reset: Math.floor(Date.now() / 1000) + 60,
  remaining: 100,
  limit: 100,
};