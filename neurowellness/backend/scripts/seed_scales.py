#!/usr/bin/env python3
"""
Seed PRS scales and conditions from JSON files into Supabase.
Usage: python scripts/seed_scales.py --scales-dir PATH --conditions-file PATH
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from app.database import get_supabase_admin


def seed_scales(scales_dir: str, conditions_file: str):
    admin = get_supabase_admin()
    scales_path = Path(scales_dir)
    total_scales = 0
    total_questions = 0

    for json_file in sorted(scales_path.glob("*.json")):
        with open(json_file, "r", encoding="utf-8") as f:
            scale = json.load(f)

        scale_id_str = scale.get("id") or json_file.stem
        print(f"  Seeding scale: {scale_id_str}...", end="", flush=True)

        scale_row = {
            "scale_id": scale_id_str,
            "name": scale.get("name", scale_id_str),
            "short_name": scale.get("shortName", scale_id_str),
            "description": scale.get("description"),
            "version": str(scale.get("version", "1.0")),
            "recall_period": scale.get("recallPeriod"),
            "instructions": scale.get("instructions"),
            "scoring_type": scale.get("scoringType") or scale.get("scoringMethod") or "sum",
            "max_score": scale.get("maxScore"),
            "max_item_score": scale.get("maxItemScore"),
            "scored_questions": json.dumps(scale.get("scoredQuestions") or []),
            "subscales": json.dumps(scale.get("subscales", [])),
            "domains": json.dumps(scale.get("domains", {})),
            "components": json.dumps(scale.get("components", [])),
            "severity_bands": json.dumps(scale.get("severityBands", [])),
            "risk_rules": json.dumps(scale.get("riskRules", [])),
            "interpretation": json.dumps(scale.get("interpretation", {})),
            "is_active": True,
        }

        result = admin.table("prs_scales").upsert(scale_row, on_conflict="scale_id").execute()

        if not result.data:
            print(f" ERROR: failed to upsert scale {scale_id_str}")
            continue

        scale_db_id = result.data[0]["id"]

        questions = scale.get("questions", [])
        question_rows = []
        for idx, q in enumerate(questions):
            q_idx = q.get("index", idx)
            q_row = {
                "scale_id": scale_db_id,
                "question_index": q_idx,
                "label": q.get("label"),
                "question_text": q.get("question") or q.get("text") or q.get("label") or f"Question {q_idx + 1}",
                "question_type": q.get("type", "likert"),
                "is_required": q.get("required", True),
                "scored_in_total": q.get("scoredInTotal", True),
                "include_in_score": q.get("includeInScore", True),
                "supplementary": q.get("supplementary", False),
                "conditional_on": json.dumps(q.get("conditionalOn")) if q.get("conditionalOn") else None,
                "options": json.dumps(q.get("options", [])),
                "validation": json.dumps(q.get("validation", {})),
                "dimension": q.get("dimension"),
            }
            question_rows.append(q_row)

        if question_rows:
            admin.table("prs_questions").upsert(
                question_rows, on_conflict="scale_id,question_index"
            ).execute()

        total_scales += 1
        total_questions += len(question_rows)
        print(f" OK ({len(question_rows)} questions)")

    print(f"\n  Seeding conditions from {conditions_file}...")
    with open(conditions_file, "r", encoding="utf-8") as f:
        condition_map = json.load(f)

    total_conditions = 0
    for cond_id, cond_data in condition_map.get("conditions", {}).items():
        cond_row = {
            "condition_id": cond_id,
            "label": cond_data.get("label", cond_id),
            "description": cond_data.get("description"),
            "scale_ids": cond_data.get("scales", []),
            "is_active": True,
        }
        admin.table("prs_conditions").upsert(cond_row, on_conflict="condition_id").execute()
        total_conditions += 1
        print(f"    OK {cond_id}: {len(cond_data.get('scales', []))} scales")

    print(f"\nSeeding complete:")
    print(f"   Scales:     {total_scales}")
    print(f"   Questions:  {total_questions}")
    print(f"   Conditions: {total_conditions}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed PRS scales into Supabase")
    parser.add_argument("--scales-dir", required=True, help="Path to scales/ directory")
    parser.add_argument("--conditions-file", required=True, help="Path to conditionMap.json")
    args = parser.parse_args()
    print("NeuroWellness Scale Seeder Starting...\n")
    seed_scales(args.scales_dir, args.conditions_file)
