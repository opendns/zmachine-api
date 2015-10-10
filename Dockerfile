FROM node:latest

ENV DEBIAN_FRONTEND noninteractive
ENV DOCKER_PORT 80
ENV PORT ${DOCKER_PORT}
ENV NODE_PATH /root

EXPOSE ${DOCKER_PORT}

ADD . /root
WORKDIR /root
RUN make all
CMD ["node","/root/src/server.js"]
