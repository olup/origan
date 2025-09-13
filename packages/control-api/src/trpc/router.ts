import { router } from "./init.js";
import { authRouter } from "./routers/auth.js";
import { buildsRouter } from "./routers/builds.js";
import { deploymentsRouter } from "./routers/deployments.js";
import { environmentsRouter } from "./routers/environments.js";
import { githubRouter } from "./routers/github.js";
import { organizationsRouter } from "./routers/organizations.js";
import { projectsRouter } from "./routers/projects.js";

export const appRouter = router({
  auth: authRouter,
  deployments: deploymentsRouter,
  organizations: organizationsRouter,
  projects: projectsRouter,
  environments: environmentsRouter,
  builds: buildsRouter,
  github: githubRouter,
});

export type AppRouter = typeof appRouter;
