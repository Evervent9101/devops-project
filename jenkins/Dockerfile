FROM jenkins/jenkins:lts-jdk17

USER root

# Node.js 20 (build/test), Docker CLI (image check stage), ssh/rsync/curl (deploy)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg openssh-client rsync git \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends nodejs docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

USER jenkins

# Plugins needed by the Jenkinsfile
RUN jenkins-plugin-cli --plugins \
    git github workflow-aggregator pipeline-stage-view \
    ssh-agent credentials-binding timestamper build-timeout
