const { execSync } = require("node:child_process");
const appJson = require("./app.json");

function safeGit(command, fallback) {
  try {
    const out = execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return out || fallback;
  } catch {
    return fallback;
  }
}

module.exports = () => {
  const base = appJson.expo;
  const iterationRaw = safeGit("git rev-list --count HEAD", "1");
  const iteration = Number(iterationRaw);
  const safeIteration = Number.isFinite(iteration) && iteration > 0 ? iteration : 1;
  const shortSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.EXPO_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    safeGit("git rev-parse --short HEAD", "local");

  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      buildIteration: safeIteration,
      shortSha,
      versionLabel: `TLF-TrackerX v0.1 alpha.${safeIteration}`,
    },
  };
};

