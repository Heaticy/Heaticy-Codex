# GitLab Gateway Migration to System Nginx

## 背景

原始架构里，GitLab 自带 `nginx` 同时承担了：

- `gitlab.vsplab.cn`
- `api.vsplab.cn`
- `heaticy.cn`
- `courses.vsplab.cn`

这会带来几个典型问题：

- GitLab 本来只应该服务 GitLab，自带 `nginx` 不适合长期兼做整机公网网关
- 多个域名混在 GitLab 这套入口下，证书、默认站点、HSTS、重定向容易互相污染
- GitLab `reconfigure` 会重写自身配置，长期维护自定义站点风险高
- 新增域名时排障边界不清晰，容易出现“HTTP 是业务站，HTTPS 却跑到 GitLab”这种串站现象

正确目标是：

- 系统 `nginx` 统一监听 `80/443`
- GitLab 退到本机高位端口
- 每个域名单独一个 `server`
- HTTPS 和证书统一在系统 `nginx` 这一层处理

## 目标架构

迁移后的目标结构：

```text
公网用户
  -> system nginx :80/:443
     -> gitlab.vsplab.cn  -> 127.0.0.1:8081
     -> api.vsplab.cn     -> 127.0.0.1:19821
     -> heaticy.cn        -> 127.0.0.1:3211
     -> courses.vsplab.cn -> 127.0.0.1:18001
```

说明：

- 系统 `nginx` 负责公网唯一入口
- GitLab 自带 `nginx` 不再监听公网 `80/443`
- GitLab 只作为后端服务

## 为什么不能继续让 GitLab 充当全局网关

GitLab 自带 `nginx` 适合：

- 服务 `gitlab.vsplab.cn`
- 与 `workhorse`、`puma` 配合

GitLab 自带 `nginx` 不适合：

- 承担所有域名的统一入口
- 长期承载与 GitLab 无关的业务站点
- 统一管理多站 HTTPS 证书和反代

一旦继续这样做，常见问题包括：

- 某个域名的 HTTPS 落到 GitLab 默认站点
- 手机浏览器因 HSTS 或 HTTPS-first 直接进入 GitLab
- GitLab `reconfigure` 后自定义站点异常
- 新加域名后很难判断流量到底命中了哪一层

## 迁移前检查

先确认：

1. GitLab 当前 `external_url`
2. GitLab 自带 `nginx` 是否监听公网 `80/443`
3. 非 GitLab 域名是否已经塞进 `/etc/gitlab/nginx/sites-enabled`
4. 各业务后端实际监听端口

建议执行：

```bash
grep -nE "external_url|nginx\\['listen|redirect_http_to_https|ssl_certificate" /etc/gitlab/gitlab.rb
ss -ltnp | grep -E '(:80 |:443 |:8080 |:8081 |:3211 |:19821 |:18001 )'
grep -Rni "server_name\|proxy_pass" /etc/gitlab/nginx /etc/nginx 2>/dev/null
```

## 第一步：让 GitLab 退到本机端口

`/etc/gitlab/gitlab.rb` 保持：

```ruby
external_url 'https://gitlab.vsplab.cn/'
```

新增或修改：

```ruby
nginx['listen_addresses'] = ['127.0.0.1']
nginx['listen_port'] = 8081
nginx['listen_https'] = false
nginx['redirect_http_to_https'] = false
```

然后执行：

```bash
gitlab-ctl reconfigure
```

迁移后应确认：

```bash
ss -ltnp | grep -E '(:80 |:443 |:8081 )'
```

期望结果：

- GitLab 自带 `nginx` 监听 `127.0.0.1:8081`
- 不再监听公网 `80/443`

## 第二步：从 GitLab 移除非 GitLab 站点

这类文件通常位于：

- `/etc/gitlab/nginx/sites-available`
- `/etc/gitlab/nginx/sites-enabled`

典型示例：

- `/etc/gitlab/nginx/sites-available/api.vsplab.cn.conf`
- `/etc/gitlab/nginx/sites-available/heaticy.cn.conf`
- `/etc/gitlab/nginx/sites-available/hypo-courses.conf`

迁移目标是：

- `gitlab.vsplab.cn` 留给 GitLab 自带 `nginx`
- 其他域名全部迁到系统 `nginx`

## 第三步：系统 nginx 接管公网入口

系统 `nginx` 统一处理：

- `gitlab.vsplab.cn`
- `api.vsplab.cn`
- `heaticy.cn`
- `courses.vsplab.cn`

站点文件建议分别放在：

- `/etc/nginx/sites-available/gitlab.vsplab.cn`
- `/etc/nginx/sites-available/api.vsplab.cn`
- `/etc/nginx/sites-available/heaticy.cn`
- `/etc/nginx/sites-available/hypo-courses`

并在 `/etc/nginx/sites-enabled/` 建立符号链接。

## 系统 nginx 参考配置

### GitLab

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name gitlab.vsplab.cn;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        return 301 https://gitlab.vsplab.cn$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name gitlab.vsplab.cn;

    ssl_certificate /etc/nginx/certs/gitlab.vsplab.cn/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/gitlab.vsplab.cn/privkey.pem;
    client_max_body_size 0;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Ssl on;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $http_connection;
    }
}
```

### API

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.vsplab.cn;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        return 301 https://api.vsplab.cn$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.vsplab.cn;

    ssl_certificate /etc/nginx/certs/api.vsplab.cn/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/api.vsplab.cn/privkey.pem;
    client_max_body_size 50m;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:19821;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $http_connection;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        add_header X-Accel-Buffering no always;
    }
}
```

### Heaticy Codex

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name heaticy.cn;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        return 301 https://heaticy.cn$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name heaticy.cn;

    ssl_certificate /etc/nginx/certs/heaticy.cn/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/heaticy.cn/privkey.pem;
    client_max_body_size 50m;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3211/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        proxy_pass http://127.0.0.1:3211;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_request_buffering off;
        add_header X-Accel-Buffering no always;
    }
}
```

### Courses

注意：`courses.vsplab.cn` 是否正确，取决于后端 `127.0.0.1:18001` 是否真的有服务在监听。

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name courses.vsplab.cn;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        return 301 https://courses.vsplab.cn$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name courses.vsplab.cn;

    ssl_certificate /etc/nginx/certs/courses.vsplab.cn/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/courses.vsplab.cn/privkey.pem;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:18001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## 证书方案

### 为什么不能用 certbot --webroot

这台机器的域名解析到的是校园网内网地址，不是公网可达地址。

这意味着：

- `HTTP-01` 不可行
- `TLS-ALPN-01` 也不可行

因此必须使用：

- `DNS-01`
- `acme.sh`
- DNSPod API

### 为什么 DNS-01 适合内网环境

`DNS-01` 不需要 Let’s Encrypt 访问你的服务器，只需要：

- 你能控制域名 DNS
- 证书工具能自动创建 `_acme-challenge` TXT 记录

因此对于：

- 校园网
- 内网部署
- 没有公网入口

这种场景，`DNS-01` 是正确方案。

## DNSPod API 凭据

`acme.sh` 的 `dns_dp` 插件使用：

- `DP_Id`
- `DP_Key`

来源是 DNSPod Token。

使用方式：

```bash
export DP_Id='你的ID'
export DP_Key='你的Token'
```

## acme.sh 证书签发示例

```bash
/root/.acme.sh/acme.sh --set-default-ca --server letsencrypt
/root/.acme.sh/acme.sh --issue --dns dns_dp -d gitlab.vsplab.cn --keylength ec-256
/root/.acme.sh/acme.sh --issue --dns dns_dp -d api.vsplab.cn --keylength ec-256
/root/.acme.sh/acme.sh --issue --dns dns_dp -d heaticy.cn --keylength ec-256
/root/.acme.sh/acme.sh --issue --dns dns_dp -d courses.vsplab.cn --keylength ec-256 --dnssleep 60
```

安装证书到系统 `nginx` 目录：

```bash
/root/.acme.sh/acme.sh --install-cert -d gitlab.vsplab.cn --ecc \
  --fullchain-file /etc/nginx/certs/gitlab.vsplab.cn/fullchain.pem \
  --key-file /etc/nginx/certs/gitlab.vsplab.cn/privkey.pem \
  --reloadcmd "systemctl reload nginx"
```

其他域名同理。

## 迁移过程中踩过的坑

### 1. 证书还没签出来就写入 443 配置

如果先把不存在的证书路径写进 `nginx` 配置：

- `nginx -t` 失败
- `reload` 失败
- 新配置完全不会生效

### 2. GitLab trusted_proxies 写坏导致 reconfigure 失败

直接乱写：

```ruby
gitlab_rails['trusted_proxies'] = ...
```

可能触发：

- `IPAddr::AddressFamilyError`

所以迁移过程中不应随意修改该项。

### 3. 系统 nginx 与 GitLab nginx 的 http2 写法不同

这台机器系统 `nginx` 正确写法是：

```nginx
listen 443 ssl http2;
```

而不是：

```nginx
http2 on;
```

### 4. API HTTPS 配置漏掉 client_max_body_size

如果 HTTPS 配置缺少：

```nginx
client_max_body_size 50m;
```

则会出现：

- `413 Payload Too Large`

### 5. courses 证书签发时 TXT 传播不稳定

`courses.vsplab.cn` 在一次签发中出现：

- `NXDOMAIN looking up TXT`

处理方式：

- 重试
- 使用 `--dnssleep 60`

### 6. courses 的问题可能并不是 nginx

即使 HTTPS 和证书都对了，如果 `127.0.0.1:18001` 上跑的是 Vite dev server，可能还会报：

- `This host ("courses.vsplab.cn") is not allowed`

这不是系统 `nginx` 问题，而是后端开发服务器的 `allowedHosts` 配置问题。

## 验证清单

### 1. 确认监听状态

```bash
ss -ltnp | grep -E '(:80 |:443 |:8081 )'
```

期望：

- 系统 `nginx` 监听 `80/443`
- GitLab 自带 `nginx` 监听 `127.0.0.1:8081`

### 2. HTTP 跳转 HTTPS

```bash
curl -I http://gitlab.vsplab.cn
curl -I http://api.vsplab.cn
curl -I http://heaticy.cn
curl -I http://courses.vsplab.cn
```

### 3. HTTPS 返回

```bash
curl -I https://gitlab.vsplab.cn
curl -I https://api.vsplab.cn
curl -I https://heaticy.cn
curl -I https://courses.vsplab.cn
```

### 4. 证书校验

```bash
echo | openssl s_client -servername gitlab.vsplab.cn -connect gitlab.vsplab.cn:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
echo | openssl s_client -servername api.vsplab.cn -connect api.vsplab.cn:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
echo | openssl s_client -servername heaticy.cn -connect heaticy.cn:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
echo | openssl s_client -servername courses.vsplab.cn -connect courses.vsplab.cn:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
```

## 迁移结果

本次迁移完成后，已经确认：

- `gitlab.vsplab.cn` 通过系统 `nginx` 反代到 `127.0.0.1:8081`
- `api.vsplab.cn` 通过系统 `nginx` 反代到 `127.0.0.1:19821`
- `heaticy.cn` 通过系统 `nginx` 反代到 `127.0.0.1:3211`

并且：

- GitLab 不再作为全局网关
- 系统 `nginx` 成为公网统一入口
- 证书改为 DNS-01 方案，更适合校园网内网环境
