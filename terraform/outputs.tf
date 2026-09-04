# ============================================================
# CivicConnect — Terraform Outputs
# ============================================================

output "server_public_ip" {
  description = "Public IP of the CivicConnect K3s server"
  value       = aws_instance.civicconnect.public_ip
}

output "server_public_dns" {
  description = "Public DNS of the server"
  value       = aws_instance.civicconnect.public_dns
}

output "ssh_command" {
  description = "SSH command to connect to the server"
  value       = "ssh -i terraform/civicconnect.pem ubuntu@${aws_instance.civicconnect.public_ip}"
}

output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = "http://${aws_instance.civicconnect.public_ip}:3000"
}

output "citizen_service_url" {
  description = "Citizen service NodePort URL"
  value       = "http://${aws_instance.civicconnect.public_ip}:30001"
}

output "kubeconfig_command" {
  description = "Command to get kubeconfig from server"
  value       = "scp -i terraform/civicconnect.pem ubuntu@${aws_instance.civicconnect.public_ip}:/etc/rancher/k3s/k3s.yaml ./kubeconfig && sed -i 's/127.0.0.1/${aws_instance.civicconnect.public_ip}/g' ./kubeconfig"
}
