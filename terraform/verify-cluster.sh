#!/bin/bash
# ============================================================
# CivicConnect — K3s Cluster Health Verification
# CCDL Lab Evaluation Helper Script
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
kubectl get nodes -o wide || echo -e "${RED}Failed to query nodes${NC}"
echo ""

echo -e "${YELLOW}2. Checking Ingress Controller Status:${NC}"
kubectl get pods -n ingress-nginx -o wide || echo -e "${RED}Ingress controller not found${NC}"
echo ""

echo -e "${YELLOW}3. Checking CivicConnect Pods:${NC}"
kubectl get pods -n civicconnect -o wide || echo -e "${RED}Failed to get civicconnect pods${NC}"
echo ""

echo -e "${YELLOW}4. Checking Services & Ingress:${NC}"
kubectl get svc,ingress -n civicconnect || echo -e "${RED}Failed to get services/ingress${NC}"
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
