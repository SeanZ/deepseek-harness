/** 仅加载于新建的合成验收 profile，读取宿主原生持久会话，不注册写操作。 */
export const inject = ["connection", "sessionQuery"];

/** 使用宿主已验证的只读查询；避免将隐藏的测试 API 会话伪装成普通 UI 会话。 */
export function apply(ctx) {
  if (
    !process.env.TAVERN_ACCEPTANCE_HOME ||
    process.env.TAVERN_ACCEPTANCE_HOME !== process.env.DSH_HOME
  )
    throw new Error("只读验收路由必须使用独立验收 home");
  ctx.connection.fetch.register({
    path: "/api/tavern-acceptance/native",
    methods: ["POST"],
    requestBody: "buffered",
    async fetch(request) {
      // Connection 将路由 URL 标准化为 dsh.internal；校验保留下来的真实 Origin。
      const origin = URL.parse(request.headers.get("origin") || "");
      if (
        !origin ||
        !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
      )
        return Response.json(
          { ok: false, reason: "loopback-origin" },
          { status: 403 },
        );
      const { sessionId } = await request.json();
      if (
        typeof sessionId !== "string" ||
        !/^(session|test|background)-[a-f0-9-]{36}$/.test(sessionId)
      ) {
        return Response.json({ ok: false }, { status: 400 });
      }
      const snapshot = await ctx.sessionQuery.readSession(sessionId);
      return Response.json({ ok: true, ...snapshot });
    },
  });
}
