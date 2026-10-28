# 独立组件发行

`component-release.yml` 使用固定 Node 24.22.1 / pnpm 11.28.5，在 Linux x64 构建 official artifacts，复用官方 release:pack 的 DSH/vendor 包。`scripts/distribution/source-artifacts.mjs` 是 patched dependency 选择、原生文件保留和组件包收集的唯一实现，私有发行本地源码验收读取固定宿主中的此模块。

组件只包含标准 npm 原包及已应用 pnpm 依赖补丁的运行时依赖，不包含 Purge、用户配置或宿主规则应用结果。`component.json` 固定仓库、完整提交、平台、Node、每个包和外层归档 SHA-256；`SHA256SUMS` 用于回读。归档身份与版本号独立，版本相同的不同提交不得混用。

工作流只生成草稿预发布，标签包含完整版本和提交前缀；不得覆盖已有同名 Release。组合消费前核对 Actions、源码提交及下载摘要，再提升同一份组件资产。npm registry 不在此流程中发布。

该目录使用 Node 标准库测试，不引入框架。修改时运行 `node --check`、Prettier、显式覆盖 mjs 的 oxlint 和 `node --test scripts/distribution/*.test.mjs`。真实打包必须从干净固定提交执行；测试夹具只证明文件处理边界，Linux 运行时安装与重启由组合侧另验。
