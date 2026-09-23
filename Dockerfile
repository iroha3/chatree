# 网页版的自持镜像：构建 dist 后用 nginx 静态托管。
#
#   docker build -t chatree .
#   docker run --rm -p 8080:80 chatree
#   # 打开 http://localhost:8080
#
# 为什么需要 HTTP 服务、不能直接开 index.html：ES module 会被 CORS 拦，
# 而且 file:// 的 origin 会让 IndexedDB 不可靠（见 docs/DEV.md）。

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
