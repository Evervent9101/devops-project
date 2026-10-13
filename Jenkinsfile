pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '15'))
        timeout(time: 20, unit: 'MINUTES')
    }

    // GitHub webhook triggers builds (see README). Polling is a fallback.
    triggers {
        githubPush()
    }

    environment {
        DEPLOY_HOST = '172.16.16.XX'            // <-- deployment server IP
        DEPLOY_USER = 'deploy'
        APP_ROOT    = '/opt/devops-app'
        RELEASE     = "${env.BUILD_NUMBER}"
        APP_VERSION = "1.0.${env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log -1 --oneline'
            }
        }

        stage('Install & Test Backend') {
            steps {
                dir('backend') {
                    sh 'node --version && npm ci'
                    sh 'npm test'
                }
            }
        }

        stage('Build Frontend') {
            steps {
                dir('frontend') {
                    sh 'npm ci'
                    sh 'npm run build'
                }
            }
        }

        stage('Docker Image Check') {
            // Proves the Dockerfile builds. Handy for learning; not used for deploy.
            steps {
                sh 'docker build -t devops-backend:${BUILD_NUMBER} backend'
            }
        }

        stage('Package') {
            steps {
                sh '''
                    rm -rf build && mkdir -p build/backend build/frontend
                    cp -r backend/src backend/package.json backend/package-lock.json build/backend/
                    cp -r frontend/dist build/frontend/dist
                    cp ecosystem.config.js build/
                    tar -czf release-${BUILD_NUMBER}.tar.gz -C build .
                '''
                archiveArtifacts artifacts: 'release-*.tar.gz', fingerprint: true
            }
        }

        stage('Deploy') {
            when { expression { env.GIT_BRANCH in ['origin/main', 'main'] } }
            steps {
                sshagent(credentials: ['deploy-ssh-key']) {
                    sh '''
                        SSH="ssh -o StrictHostKeyChecking=accept-new ${DEPLOY_USER}@${DEPLOY_HOST}"
                        scp -o StrictHostKeyChecking=accept-new release-${BUILD_NUMBER}.tar.gz ${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/
                        $SSH "bash ${APP_ROOT}/deploy.sh ${BUILD_NUMBER} ${APP_VERSION}"
                    '''
                }
            }
        }

        stage('Smoke Test') {
            when { expression { env.GIT_BRANCH in ['origin/main', 'main'] } }
            steps {
                sh '''
                    for i in 1 2 3 4 5 6; do
                      if curl -fsS http://${DEPLOY_HOST}/api/health; then exit 0; fi
                      echo "not healthy yet, retry $i"; sleep 5
                    done
                    echo "Smoke test failed" && exit 1
                '''
            }
        }
    }

    post {
        success { echo "Build #${env.BUILD_NUMBER} deployed OK" }
        failure { echo "Build #${env.BUILD_NUMBER} FAILED - check the stage logs" }
        cleanup { sh 'docker image prune -f || true' }
    }
}
