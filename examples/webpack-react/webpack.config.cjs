const HtmlWebpackPlugin = require('html-webpack-plugin')
const { AiInsWebpackPlugin } = require('@ai-ins/webpack')

module.exports = {
  devServer: {
    open: true,
    port: 5180,
  },
  entry: './src/main.tsx',
  experiments: {
    css: true,
  },
  mode: 'development',
  module: {
    rules: [
      {
        exclude: /node_modules/,
        test: /\.[jt]sx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      },
    ],
  },
  plugins: [
    // 在这里添加 AiInsWebpackPlugin 插件即可
    new AiInsWebpackPlugin(),
    new HtmlWebpackPlugin({ template: './src/index.html' }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
}
