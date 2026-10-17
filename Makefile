.PHONY: help install up down build restart logs test lint build-frontend clean

help:
	@echo "Danh sách lệnh hỗ trợ Đi Đâu:"
	@echo "  make install         - Cài đặt dependencies cho backend và frontend"
	@echo "  make up              - Khởi động toàn bộ container (db, backend, frontend)"
	@echo "  make down            - Dừng toàn bộ container"
	@echo "  make build           - Build lại Docker containers"
	@echo "  make restart         - Khởi động lại containers"
	@echo "  make logs            - Xem logs của containers"
	@echo "  make test            - Chạy pytest ở backend"
	@echo "  make lint            - Kiểm tra linter cho backend và frontend"
	@echo "  make build-frontend  - Build production bundle cho frontend"
	@echo "  make clean           - Dọn dẹp cache và build artifacts"

install:
	cd backend && poetry install
	cd frontend && npm install

up:
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build

restart:
	docker-compose restart

logs:
	docker-compose logs -f

test:
	cd backend && poetry run pytest

lint:
	cd backend && poetry run ruff check .
	cd frontend && npm run lint

build-frontend:
	cd frontend && npm run build

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +
	rm -rf frontend/dist
