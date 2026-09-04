# ============================================================
# CivicConnect — Terraform Main (AWS EC2 + K3s)
# Free Tier: t2.micro (1 vCPU, 1GB RAM) in us-east-1
# ============================================================

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ─────────────────────────────────────────────
# SSH Key Pair (auto-generated)
# ─────────────────────────────────────────────
resource "tls_private_key" "civicconnect_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "civicconnect" {
  key_name   = "${var.project_name}-key"
  public_key = tls_private_key.civicconnect_key.public_key_openssh
}

resource "local_file" "private_key" {
  content         = tls_private_key.civicconnect_key.private_key_pem
  filename        = "${path.module}/civicconnect.pem"
  file_permission = "0600"
}

# ─────────────────────────────────────────────
# VPC & Networking
# ─────────────────────────────────────────────
resource "aws_vpc" "civicconnect" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name    = "${var.project_name}-vpc"
    Project = var.project_name
  }
}

resource "aws_internet_gateway" "civicconnect" {
  vpc_id = aws_vpc.civicconnect.id
  tags = {
    Name    = "${var.project_name}-igw"
    Project = var.project_name
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.civicconnect.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name    = "${var.project_name}-public-subnet"
    Project = var.project_name
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.civicconnect.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.civicconnect.id
  }
  tags = { Name = "${var.project_name}-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# ─────────────────────────────────────────────
# Security Group
# ─────────────────────────────────────────────
resource "aws_security_group" "civicconnect" {
  name        = "${var.project_name}-sg"
  description = "CivicConnect K3s cluster security group"
  vpc_id      = aws_vpc.civicconnect.id

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
    description = "SSH access"
  }

  # HTTP
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP"
  }

  # HTTPS
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }

  # K3s API server
  ingress {
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
    description = "K3s API server"
  }

  # NodePort range for CivicConnect
  ingress {
    from_port   = 30000
    to_port     = 32767
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Kubernetes NodePort range"
  }

  # Grafana
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Grafana dashboard"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-sg"
    Project = var.project_name
  }
}

# ─────────────────────────────────────────────
# EC2 Instance (Free Tier)
# ─────────────────────────────────────────────
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "civicconnect" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.civicconnect.key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.civicconnect.id]

  root_block_device {
    volume_type           = "gp2"
    volume_size           = 20 # Free tier: up to 30GB
    delete_on_termination = true
  }

  user_data = base64encode(templatefile("${path.module}/userdata.sh", {
    project_name = var.project_name
  }))

  tags = {
    Name    = "${var.project_name}-server"
    Project = var.project_name
    ManagedBy = "Terraform"
  }
}
