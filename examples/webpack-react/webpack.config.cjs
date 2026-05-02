const HtmlWebpackPlugin = require('html-webpack-plugin')
const { AgentDevWebpackPlugin } = require('@agent-dev/webpack')

module.exports = {
  devServer: {
    port: 5180,
  },
  entry: './src/main.tsx',
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
    // 在这里添加 AgentDevWebpackPlugin 插件即可
    new AgentDevWebpackPlugin(),
    new HtmlWebpackPlugin({ template: './src/index.html' }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
}
