export type Locale = 'zh' | 'en';

export const translations = {
  zh: {
    // 通用
    loading: '加载中...',
    more: '查看更多',
    back: '返回',
    login: '登录',
    register: '注册',
    logout: '退出登录',
    submit: '投稿',

    // 导航
    nav: {
      home: '首页',
      live: '直播',
      works: '作品',
      myStreams: '我的直播',
      myWorks: '我的作品',
      createLive: '创建直播间',
      createWork: '创建作品',
    },

    // 搜索
    searchPlaceholder: '搜索直播、作品、UP主...',

    // 首页
    home: {
      heroTitle: '与 AI 龙虾一起直播创作',
      heroSubtitle: '实时分享你与 OpenClaw Agent 的互动，让观众围观 AI 的魔法',
      startLive: '开始直播',
      exploreWorks: '探索作品',
      liveSection: '正在直播',
      worksSection: '推荐作品',
      noLive: '暂无正在直播的房间',
      noWorks: '暂无推荐作品',
      createRoomPrompt: '创建直播间，开始与你的 Agent 对话',
      createWorkPrompt: '创作第一个作品，展示 AI 的创意',
    },

    // 直播
    rooms: {
      title: '直播',
      subtitle: '围观 OpenClaw AI agents 实时工作',
      createRoom: '创建直播间',
      noLive: '暂无正在直播的房间',
      createAndStart: '创建直播间并开始直播吧！',
    },

    // 作品
    works: {
      title: '作品',
      subtitle: '探索 OpenClaw AI 创作的精彩作品',
      create: '创建作品',
      noWorks: '暂无作品',
      createFirst: '创建第一个作品',
      partitionAll: '全部',
    },

    // 作品分区（参考 OpenClaw Skills）
    partitions: {
      productivity: '效率工具',
      writing: '写作与内容',
      coding: '编程与开发',
      data: '数据分析',
      documents: '文档处理',
      communication: '沟通协作',
      search: '搜索与研究',
      marketing: '营销增长',
      media: '图片与视频',
      automation: '自动化',
      notes: '笔记与知识库',
      calendar: '日历与日程',
      ai: 'AI 与智能体',
      finance: '金融与交易',
      smart_home: '智能家居',
      other: '其它',
    },

    // 我的直播
    myStreams: {
      title: '我的直播',
      sessions: '场次',
      messages: '消息',
      createNew: '创建新直播',
      liveNow: '正在直播',
      history: '历史直播',
      noLive: '暂无正在进行的直播',
      createPrompt: '创建一个新的直播间，开始与你的 Agent 互动吧！',
      noHistory: '暂无历史直播记录',
    },

    // 我的作品
    myWorks: {
      title: '我的作品',
      works: '作品',
      views: '浏览',
      likes: '点赞',
      createNew: '创建新作品',
      drafts: '草稿',
      published: '已发布',
      continueEdit: '继续创作',
      delete: '删除',
      noWorks: '还没有作品',
      createPrompt: '开始创作你的第一个作品吧！',
      createWork: '创建作品',
      confirmDelete: '确认删除这个作品吗？此操作无法撤销。',
      deleteFailed: '删除失败',
    },

    // 主播主页
    host: {
      liveNow: '正在直播',
      history: '历史直播',
      noHistory: '暂无历史直播记录',
    },

    // 历史记录
    history: {
      backToHost: '返回主播主页',
      ended: '已结束',
      replayTitle: '聊天记录回放',
      noMessages: '这场直播没有留下任何消息记录',
      backToList: '返回房间列表',
      loadFailed: '加载失败',
    },

    // 作品详情
    workDetail: {
      backToList: '返回作品列表',
      creativeProcess: '创作过程',
      processDesc: '作者与 {name} 的对话记录',
      noMessages: '这个作品还没有对话记录',
      loadFailed: '加载失败',
      notFound: '作品不存在',
      resultSummary: '一句话结果',
      tryMyAI: '让我的 AI 也试一次',
      resultSummaryPlaceholder: '如：这个 AI 帮我 10 分钟整理完了一份周报',
      publishModalTitle: '发布前填写',
      partitionLabel: '作品分区',
      partitionRequired: '请选择作品分区',
      resultSummaryLabel: '一句话描述 AI 达成的结果（适合转发）',
      skillMarkdownLabel: 'Skill 内容（复制即学会，粘贴到其他 Agent 即可掌握）',
      skillMarkdownPlaceholder: '粘贴完整的 SKILL.md（含 YAML 头与正文），留空则从对话中自动提取',
      copySkillMd: '复制SKILL.md，赋能我的AI',
      copied: '已复制',
      noSkillToCopy: '该作品暂无可复制的 Skill 内容',
      agentTyping: '正在输入中...',
    },

    // 登录/注册
    auth: {
      loginTitle: '登录 ClawLive',
      loginSubtitle: '开始你的龙虾直播之旅',
      username: '用户名',
      password: '密码',
      loggingIn: '登录中...',
      loginBtn: '登录',
      noAccount: '还没有账号?',
      registerNow: '立即注册',
      backToRooms: '返回房间列表',
      registerTitle: '注册 ClawLive',
      registerSubtitle: '创建账号，开始你的龙虾直播',
      email: '邮箱',
      confirmPassword: '确认密码',
      registerBtn: '注册',
      registering: '注册中...',
      hasAccount: '已有账号?',
      loginNow: '立即登录',
      passwordMismatch: '密码不匹配',
      passwordMinLength: '密码至少 6 位',
      loginFailed: '登录失败',
      registerFailed: '注册失败',
      networkError: '无法连接服务器，请确认后端服务已启动（默认端口 3001）',
    },

    // 语言切换
    language: '语言',
    langZh: '简体中文',
    langEn: 'English',
  },
  en: {
    loading: 'Loading...',
    more: 'View more',
    back: 'Back',
    login: 'Login',
    register: 'Register',
    logout: 'Log out',
    submit: 'Submit',

    nav: {
      home: 'Home',
      live: 'Live',
      works: 'Works',
      myStreams: 'My Streams',
      myWorks: 'My Works',
      createLive: 'Create Room',
      createWork: 'Create Work',
    },

    searchPlaceholder: 'Search live, works, creators...',

    home: {
      heroTitle: 'Live & Create with AI Lobster',
      heroSubtitle: 'Share your OpenClaw Agent interactions in real time. Let the audience witness AI magic.',
      startLive: 'Start Live',
      exploreWorks: 'Explore Works',
      liveSection: 'Live Now',
      worksSection: 'Recommended',
      noLive: 'No live rooms',
      noWorks: 'No recommended works',
      createRoomPrompt: 'Create a room and start chatting with your Agent',
      createWorkPrompt: 'Create your first work and showcase AI creativity',
    },

    rooms: {
      title: 'Live',
      subtitle: 'Watch OpenClaw AI agents work in real time',
      createRoom: 'Create Room',
      noLive: 'No live rooms',
      createAndStart: 'Create a room and start streaming!',
    },

    works: {
      title: 'Works',
      subtitle: 'Explore works created with OpenClaw AI',
      create: 'Create Work',
      noWorks: 'No works yet',
      createFirst: 'Create your first work',
      partitionAll: 'All',
    },

    partitions: {
      productivity: 'Productivity',
      writing: 'Writing & Content',
      coding: 'Coding & Development',
      data: 'Data & Analytics',
      documents: 'Documents',
      communication: 'Communication',
      search: 'Search & Research',
      marketing: 'Marketing & Sales',
      media: 'Image & Video',
      automation: 'Automation',
      notes: 'Notes & PKM',
      calendar: 'Calendar & Scheduling',
      ai: 'AI & Agents',
      finance: 'Finance',
      smart_home: 'Smart Home & IoT',
      other: 'Other',
    },

    myStreams: {
      title: 'My Streams',
      sessions: 'Sessions',
      messages: 'Messages',
      createNew: 'Create New',
      liveNow: 'Live Now',
      history: 'History',
      noLive: 'No live streams',
      createPrompt: 'Create a room and start interacting with your Agent!',
      noHistory: 'No streaming history',
    },

    myWorks: {
      title: 'My Works',
      works: 'Works',
      views: 'Views',
      likes: 'Likes',
      createNew: 'Create New',
      drafts: 'Drafts',
      published: 'Published',
      continueEdit: 'Continue',
      delete: 'Delete',
      noWorks: 'No works yet',
      createPrompt: 'Create your first work!',
      createWork: 'Create Work',
      confirmDelete: 'Delete this work? This cannot be undone.',
      deleteFailed: 'Delete failed',
    },

    host: {
      liveNow: 'Live Now',
      history: 'History',
      noHistory: 'No history',
    },

    history: {
      backToHost: 'Back to host',
      ended: 'Ended',
      replayTitle: 'Chat replay',
      noMessages: 'No messages in this stream',
      backToList: 'Back to rooms',
      loadFailed: 'Load failed',
    },

    workDetail: {
      backToList: 'Back to works',
      creativeProcess: 'Creative process',
      processDesc: 'Conversation with {name}',
      noMessages: 'No messages yet',
      loadFailed: 'Load failed',
      notFound: 'Work not found',
      resultSummary: 'Result in one sentence',
      tryMyAI: 'Try with my AI',
      resultSummaryPlaceholder: 'e.g. This AI helped me finish a weekly report in 10 mins',
      publishModalTitle: 'Before publishing',
      partitionLabel: 'Work partition',
      partitionRequired: 'Please select a partition',
      resultSummaryLabel: 'One-sentence result (shareable)',
      skillMarkdownLabel: 'Skill content (copy to learn, paste into another Agent)',
      skillMarkdownPlaceholder: 'Paste full SKILL.md (YAML + body), or leave empty to auto-extract from chat',
      copySkillMd: 'Copy SKILL.md, empower my AI',
      copied: 'Copied',
      noSkillToCopy: 'No Skill content available to copy',
      agentTyping: 'Typing...',
    },

    auth: {
      loginTitle: 'Login to ClawLive',
      loginSubtitle: 'Start your lobster streaming journey',
      username: 'Username',
      password: 'Password',
      loggingIn: 'Logging in...',
      loginBtn: 'Login',
      noAccount: "Don't have an account?",
      registerNow: 'Register',
      backToRooms: 'Back to rooms',
      registerTitle: 'Register ClawLive',
      registerSubtitle: 'Create account and start streaming',
      email: 'Email',
      confirmPassword: 'Confirm password',
      registerBtn: 'Register',
      registering: 'Registering...',
      hasAccount: 'Already have an account?',
      loginNow: 'Login',
      passwordMismatch: 'Passwords do not match',
      passwordMinLength: 'Password must be at least 6 characters',
      loginFailed: 'Login failed',
      registerFailed: 'Registration failed',
      networkError: 'Cannot connect to server. Please ensure the backend is running (default port 3001).',
    },

    language: 'Language',
    langZh: '简体中文',
    langEn: 'English',
  },
} as const;

export type TranslationKey = keyof typeof translations.zh;
