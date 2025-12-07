import type { NextConfig } from "next";
import type webpack from "webpack";

type Configuration = webpack.Configuration;

interface WebpackOptions {
  isServer: boolean;
  webpack: {
    NormalModuleReplacementPlugin: typeof webpack.NormalModuleReplacementPlugin;
  };
}

export function withNextDoctor(config: NextConfig = {}): NextConfig {
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
            (resource) => {
              // Only replace if NOT from node_modules
              // This prevents breaking third-party libraries
              if (resource.context && !resource.context.includes('node_modules')) {
                resource.request = 'nextdoctor/react';
              }
            }
          )
        );
      }

      return customConfig;
    },
  };
}
