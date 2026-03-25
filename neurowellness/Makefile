dev:
	docker-compose up --build

stop:
	docker-compose down

seed:
	cd backend && python scripts/seed_scales.py \
		--scales-dir ../../data/scales \
		--conditions-file ../../data/conditionMap.json

backend-shell:
	docker-compose exec backend bash

logs:
	docker-compose logs -f

test:
	cd backend && pytest tests/ -v

backend-dev:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend-dev:
	cd frontend && npm run dev
