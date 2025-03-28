import { ComponentResourceOptions, Input, all } from "@pulumi/pulumi";
import { Component } from "../component";
import {
  buildKvNamespace,
  createKvRouteData,
  parsePattern,
  RouterBaseRouteArgs,
  updateKvRoutes,
} from "./router-base-route";
import { RouterUrlRouteArgs } from "./router";
import { toSeconds } from "../duration";

export interface Args extends RouterBaseRouteArgs {
  /**
   * The host to route to.
   */
  host: Input<string>;
  /**
   * Additional arguments for the route.
   */
  routeArgs?: Input<RouterUrlRouteArgs>;
}

/**
 * The `RouterUrlRoute` component is internally used by the `Router` component
 * to add routes.
 *
 * :::note
 * This component is not intended to be created directly.
 * :::
 *
 * You'll find this component returned by the `route` method of the `Router` component.
 */
export class RouterUrlRoute extends Component {
  constructor(name: string, args: Args, opts?: ComponentResourceOptions) {
    super(__pulumiType, name, args, opts);

    const self = this;

    all([args.pattern, args.routeArgs]).apply(([pattern, routeArgs]) => {
      const patternData = parsePattern(pattern);
      const namespace = buildKvNamespace(name);
      createKvRouteData(name, args, self, namespace, {
        host: args.host,
        rewrite: routeArgs?.rewrite,
        origin: {
          connectionAttempts: routeArgs?.connectionAttempts,
          timeouts: {
            connectionTimeout:
              routeArgs?.connectionTimeout &&
              toSeconds(routeArgs?.connectionTimeout),
            readTimeout:
              routeArgs?.readTimeout && toSeconds(routeArgs?.readTimeout),
            keepAliveTimeout:
              routeArgs?.keepAliveTimeout &&
              toSeconds(routeArgs?.keepAliveTimeout),
          },
        },
      });
      updateKvRoutes(name, args, self, "url", namespace, patternData);
    });
  }
}

const __pulumiType = "sst:aws:RouterUrlRoute";
// @ts-expect-error
RouterUrlRoute.__pulumiType = __pulumiType;
