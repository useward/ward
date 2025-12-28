import type { NextConfig } from "next";
import type webpack from "webpack";

type Configuration = webpack.Configuration;

interface WebpackOptions {
  isServer: boolean;
  webpack: {
    NormalModuleReplacementPlugin: typeof webpack.NormalModuleReplacementPlugin;
  };
}

interface ResolveData {
  context?: string;
  contextInfo?: {
    issuerLayer?: string | null;
  };
  request: string;
}

export function withWard(config: NextConfig = {}): NextConfig {
  const originalWebpack = config.webpack;

  return {
    ...config,
    webpack: (webpackConfig: Configuration, options: WebpackOptions) => {
      let customConfig = webpackConfig;
      if (originalWebpack) {
        customConfig = originalWebpack(webpackConfig, options as never);
      }

      if (options.isServer) {
        const { NormalModuleReplacementPlugin } = options.webpack;

        customConfig.plugins = customConfig.plugins || [];
        customConfig.plugins.push(
          new NormalModuleReplacementPlugin(
            /^react$/,
            (resource: ResolveData) => {
              const layer = resource.contextInfo?.issuerLayer;
              const isFromNodeModules =
                resource.context?.includes("node_modules");

              // Replace for React Server Components and server actions
              // Layers: "rsc" = server components, "action-browser" = server actions, "ssr" = client SSR
              const isServerLayer =
                layer === "rsc" || layer === "action-browser";
              if (isServerLayer && !isFromNodeModules) {
                resource.request = "@useward/server-react";
              }
            },
          ),
        );
      }

      return customConfig;
    },
  };
}
