#!/bin/bash
# ============================================================
# CivicConnect — EC2 Bootstrap Script (K3s + Docker + NGINX Ingress)
# ============================================================
set -e

export DEBIAN_FRONTEND=noninteractive
PROJECT="${project_name}"

echo "==> [1/6] Updating system packages..."
apt-get update -y
apt-get upgrade -y

echo "==> [2/6] Installing essential dependencies..."
apt-get install -y curl wget git unzip jq net-tools apt-transport-https ca-certificates

echo "==> [3/6] Installing Docker Engine..."
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu
systemctl enable docker
systemctl start docker

echo "==> [4/6] Installing K3s (lightweight Kubernetes)..."
curl -sfL https://get.k3s.io | sh -s - \
  --write-kubeconfig-mode 644 \
  --disable traefik \
  --node-name civicconnect-master

echo "==> Waiting for K3s node to reach Ready state..."
sleep 20
until kubectl get nodes | grep -q "Ready"; do
  echo "Node not ready yet. Waiting 5s..."
  sleep 5
done
echo "✅ K3s master node is Ready!"

echo "==> [5/6] Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml

echo "==> Creating CivicConnect namespace..."
kubectl create namespace civicconnect --dry-run=client -o yaml | kubectl apply -f -

echo "==> Setting up kubeconfig for ubuntu user..."
mkdir -p /home/ubuntu/.kube
cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
chown -R ubuntu:ubuntu /home/ubuntu/.kube

echo "==> [6/6] Generating cluster verification script..."
cat << 'EOF' > /home/ubuntu/verify-cluster.sh
#!/bin/bash
# ============================================================
# CivicConnect — K3s Cluster Health Verification
# ============================================================
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}🔍 CivicConnect — K3s Cluster Verification${NC}"
echo -e "${BLUE}======================================================${NC}\n"

echo -e "${YELLOW}1. Checking Kubernetes Nodes:${NC}"
kubectl get nodes -o wide
echo ""

echo -e "${YELLOW}2. Checking Ingress Controller Status:${NC}"
kubectl get pods -n ingress-nginx -o wide
echo ""

echo -e "${YELLOW}3. Checking CivicConnect Pods:${NC}"
kubectl get pods -n civicconnect -o wide
echo ""

echo -e "${YELLOW}4. Checking Services & Ingress:${NC}"
kubectl get svc,ingress -n civicconnect
echo ""

echo -e "${YELLOW}5. Testing Health Endpoints:${NC}"
check_endpoint() {
  local name=$1
  local url=$2
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
  if [ "$status" -ge 200 ] && [ "$status" -lt 400 ]; then
    echo -e "  [${GREEN}OK${NC}] $name ($url) -> HTTP $status"
  else
    echo -e "  [${RED}FAIL${NC}] $name ($url) -> HTTP $status"
  fi
}

check_endpoint "Frontend NodePort" "http://localhost:30080/health"
check_endpoint "Citizen Service NodePort" "http://localhost:30001/health"
check_endpoint "Ingress Gateway Host" "http://localhost/health"

echo -e "\n${GREEN}Verification run finished.${NC}\n"
EOF

chmod +x /home/ubuntu/verify-cluster.sh
ln -sf /home/ubuntu/verify-cluster.sh /usr/local/bin/verify-cluster
chown ubuntu:ubuntu /home/ubuntu/verify-cluster.sh

echo "==> Bootstrap complete! K3s cluster ready."
echo "==> Run: verify-cluster or kubectl get nodes"
