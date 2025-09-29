FROM nginx:alpine

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy static content
COPY packages/admin/dist /usr/share/nginx/admin
COPY packages/landing/out /usr/share/nginx/landing

# Copy nginx configuration
ARG NGINX_CONF_PATH=infra/nginx.conf
COPY ${NGINX_CONF_PATH} /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]