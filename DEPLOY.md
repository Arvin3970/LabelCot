# LabelCot 部署指南

## 开发环境

```bash
npm install
npm run dev
```

## 生产环境部署

### 方式一：使用 Node.js 服务器

```bash
# 1. 安装依赖
npm install

# 2. 构建生产版本
npm run build

# 3. 启动生产服务器
npm run start
```

服务器将在 `http://0.0.0.0:5173` 启动，局域网内可通过 `http://<服务器IP>:5173` 访问。

### 方式二：使用静态文件服务器

1. 执行 `npm run build`
2. 将 `dist` 目录部署到任意静态文件服务器（Nginx、Apache、IIS等）

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /path/to/LabelCot/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker 部署

```bash
docker build -t labelcot .
docker run -d -p 5173:5173 -p 3001:3001 labelcot
```

## 环境变量

- `PORT`: 前端服务器端口（默认 5173）
- `PROXY_PORT`: API 代理端口（默认 3001）
