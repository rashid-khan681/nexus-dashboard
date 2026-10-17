FROM public.ecr.aws/nginx/nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
# Directory that Elastic Beanstalk reads health logs from. On Beanstalk it is bind-mounted and the
# platform hook fixes its ownership; the chown below makes the same setup work locally too.
RUN mkdir -p /var/log/nginx/healthd && chown -R nginx:nginx /var/log/nginx
EXPOSE 80
