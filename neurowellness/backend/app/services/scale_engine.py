from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ScoreResult:
    total: float
    max_possible: float
    question_scores: Dict[int, float] = field(default_factory=dict)
    subscale_scores: Dict[str, Any] = field(default_factory=dict)
    domain_scores: Dict[str, Any] = field(default_factory=dict)
    component_scores: Dict[str, Any] = field(default_factory=dict)
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SeverityResult:
    level: str
    label: str
    description: str = ""
    min_score: float = 0
    max_score: float = 0


@dataclass
class RiskFlag:
    message: str
    priority: str = "moderate"
    question_index: Optional[int] = None
    value: Any = None
    source: str = ""


class ScaleEngine:

    def calculate_score(self, scale_config: dict, responses: Dict[int, Any]) -> ScoreResult:
        scoring_type = scale_config.get("scoringType") or scale_config.get("scoringMethod") or "sum"
        handler = getattr(self, f"_score_{scoring_type.replace('-', '_')}", self._score_sum)
        return handler(responses, scale_config)

    def get_severity(self, scale_config: dict, total_score: float) -> Optional[SeverityResult]:
        bands = scale_config.get("severityBands", [])
        for band in bands:
            if band.get("min", 0) <= total_score <= band.get("max", float("inf")):
                return SeverityResult(
                    level=band.get("level", "unknown"),
                    label=band.get("label", ""),
                    description=band.get("description", ""),
                    min_score=band.get("min", 0),
                    max_score=band.get("max", 0),
                )
        return None

    def detect_risk_flags(self, scale_config: dict, responses: Dict[int, Any], score_result: ScoreResult) -> List[RiskFlag]:
        flags = []
        scale_id = scale_config.get("id", "")
        risk_rules = scale_config.get("riskRules", [])

        for rule in risk_rules:
            rule_type = rule.get("type", "threshold")

            if rule_type == "item_threshold":
                q_idx = rule.get("questionIndex")
                if q_idx is not None and q_idx in responses:
                    val = self._to_float(responses[q_idx])
                    if val is not None:
                        operator = rule.get("operator", ">=")
                        threshold = rule.get("threshold", 0)
                        if self._compare(val, operator, threshold):
                            flags.append(RiskFlag(
                                message=rule.get("message", f"Risk flag on question {q_idx}"),
                                priority=rule.get("priority") or rule.get("severity", "moderate"),
                                question_index=q_idx,
                                value=val,
                                source=scale_id,
                            ))

            elif rule_type == "total_threshold":
                val = score_result.total
                operator = rule.get("operator", ">=")
                threshold = rule.get("threshold", 0)
                if self._compare(val, operator, threshold):
                    flags.append(RiskFlag(
                        message=rule.get("message", "Score exceeds risk threshold"),
                        priority=rule.get("priority") or rule.get("severity", "moderate"),
                        value=val,
                        source=scale_id,
                    ))

            elif rule_type == "functionalImpairment" or rule.get("condition") == "functionalImpairment":
                threshold = rule.get("threshold", 2)
                for q_idx, val in responses.items():
                    f_val = self._to_float(val)
                    if f_val is not None and f_val >= threshold:
                        questions = scale_config.get("questions", [])
                        if q_idx < len(questions):
                            q = questions[q_idx]
                            if not q.get("scoredInTotal", True):
                                flags.append(RiskFlag(
                                    message=rule.get("message", "Significant functional impairment reported"),
                                    priority=rule.get("priority", "moderate"),
                                    question_index=q_idx,
                                    value=f_val,
                                    source=scale_id,
                                ))
                                break

        return flags

    # -------------------------------------------------------
    # SCORING HANDLERS
    # -------------------------------------------------------

    def _score_sum(self, responses: dict, config: dict) -> ScoreResult:
        total = 0.0
        question_scores = {}
        scored_questions = config.get("scoredQuestions")

        for i, question in enumerate(config.get("questions", [])):
            if scored_questions is not None and len(scored_questions) > 0 and i not in scored_questions:
                continue
            if question.get("scoredInTotal") is False:
                continue
            if question.get("includeInScore") is False:
                continue
            if question.get("supplementary") is True:
                continue

            val = responses.get(i)
            if val is not None and val != "":
                num = self._to_float(val)
                if num is not None:
                    points = self._get_option_points(question, val, num)
                    total += points
                    question_scores[i] = points

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore") or self._calc_max_score(config),
            question_scores=question_scores,
        )

    def _score_sum_numeric(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_sum_subscales(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_subscale_sum(responses, config)

    def _score_weighted_sum(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_mean(self, responses: dict, config: dict) -> ScoreResult:
        result = self._score_sum(responses, config)
        answered = len([v for v in responses.values() if v is not None and v != ""])
        if answered > 0:
            result.total = round(result.total / answered, 2)
        return result

    def _score_vas_mean(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_mean(responses, config)

    def _score_nrs(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_single_selection(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_clinician(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_binary_cutoff(self, responses: dict, config: dict) -> ScoreResult:
        result = self._score_sum(responses, config)
        cutoff = config.get("cutoff")
        result.extra["is_positive"] = result.total >= cutoff if cutoff is not None else None
        result.extra["cutoff"] = cutoff
        return result

    def _score_weighted_binary(self, responses: dict, config: dict) -> ScoreResult:
        total = 0.0
        question_scores = {}
        for i, question in enumerate(config.get("questions", [])):
            val = responses.get(i)
            if val is not None:
                points = self._get_option_points(question, val, 0)
                total += points
                question_scores[i] = points
        cutoff = config.get("cutoff")
        max_possible = config.get("maxScore") or self._calc_max_score(config)
        return ScoreResult(
            total=total,
            max_possible=max_possible,
            question_scores=question_scores,
            extra={"is_positive": total >= cutoff if cutoff is not None else None, "cutoff": cutoff},
        )

    def _score_reverse_scored(self, responses: dict, config: dict) -> ScoreResult:
        total = 0.0
        question_scores = {}
        reverse_items = config.get("reverseItems", [])
        max_item = config.get("maxItemScore", 3)

        for i, question in enumerate(config.get("questions", [])):
            val = responses.get(i)
            if val is not None and val != "":
                num = self._to_float(val)
                if num is not None:
                    if i in reverse_items:
                        num = max_item - num
                    total += num
                    question_scores[i] = num

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore") or self._calc_max_score(config),
            question_scores=question_scores,
            extra={"reverse_items": reverse_items},
        )

    def _score_subscale_sum(self, responses: dict, config: dict) -> ScoreResult:
        subscale_scores = {}
        total = 0.0

        for subscale in config.get("subscales", []):
            sub_total = 0.0
            for idx in subscale.get("questionIndices", []):
                val = responses.get(idx)
                if val is not None and val != "":
                    num = self._to_float(val)
                    if num is not None:
                        questions = config.get("questions", [])
                        q = questions[idx] if idx < len(questions) else {}
                        points = self._get_option_points(q, val, num)
                        sub_total += points

            multiplier = subscale.get("multiplier", 1)
            final = round(sub_total * multiplier, 2)
            subscale_scores[subscale["id"]] = {
                "name": subscale.get("name", ""),
                "raw": sub_total,
                "multiplier": multiplier,
                "score": final,
            }
            total += final

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore", 0),
            subscale_scores=subscale_scores,
        )

    def _score_subscale_severity(self, responses: dict, config: dict) -> ScoreResult:
        result = self._score_subscale_sum(responses, config)
        for sub_id, sub_data in result.subscale_scores.items():
            subscale_def = next((s for s in config.get("subscales", []) if s["id"] == sub_id), {})
            if subscale_def.get("severityBands"):
                sev = self.get_severity({"severityBands": subscale_def["severityBands"]}, sub_data["score"])
                result.subscale_scores[sub_id]["severity"] = sev.__dict__ if sev else None
        return result

    def _score_fiqr_weighted(self, responses: dict, config: dict) -> ScoreResult:
        domains = config.get("domains", {})
        domain_scores = {}
        total = 0.0

        for domain_id, domain in domains.items():
            raw = 0.0
            answered = 0
            for item_idx in domain.get("items", []):
                val = responses.get(item_idx)
                if val is not None and val != "":
                    num = self._to_float(val)
                    if num is not None:
                        raw += num
                        answered += 1
            divisor = domain.get("divisor", 1)
            score = round(raw / divisor, 2) if divisor else 0
            domain_scores[domain_id] = {
                "name": domain.get("name", ""),
                "raw": raw,
                "divisor": divisor,
                "score": score,
                "max_weighted": domain.get("maxWeighted"),
                "items_answered": answered,
                "total_items": len(domain.get("items", [])),
            }
            total += score

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore", 100),
            domain_scores=domain_scores,
        )

    def _score_weighted_domain_sum(self, responses: dict, config: dict) -> ScoreResult:
        domain_scores = {}
        total = 0.0
        domains = config.get("domains", [])
        # handle both list and dict
        if isinstance(domains, dict):
            domains = list(domains.values())

        for domain in domains:
            raw = 0.0
            max_raw = 0.0
            questions = config.get("questions", [])
            for idx in domain.get("questionIndices", []):
                q = questions[idx] if idx < len(questions) else {}
                val = responses.get(idx)
                if val is not None and val != "":
                    points = self._get_option_points(q, val, 0)
                    raw += points
                if q.get("options"):
                    max_points = max((o.get("points", o.get("value", 0)) for o in q["options"]), default=0)
                    max_raw += float(max_points)

            multiplier = domain.get("multiplier", 1)
            weighted = round(raw * multiplier, 2)
            domain_id = domain.get("id", str(len(domain_scores)))
            domain_scores[domain_id] = {
                "name": domain.get("name", ""),
                "raw": raw,
                "multiplier": multiplier,
                "weighted": weighted,
                "max_raw": max_raw,
                "max_weighted": domain.get("maxScore", round(max_raw * multiplier, 2)),
            }
            total += weighted

        return ScoreResult(
            total=round(total, 2),
            max_possible=config.get("maxScore", 100),
            domain_scores=domain_scores,
        )

    def _score_component_sum(self, responses: dict, config: dict) -> ScoreResult:
        component_scores = {}
        total = 0.0

        for component in config.get("components", []):
            score = self._calculate_component_score(component, responses, config)
            component_scores[component["id"]] = {
                "name": component.get("name", ""),
                "description": component.get("description", ""),
                "score": score,
                "max_score": component.get("maxScore", 3),
            }
            total += score

        return ScoreResult(
            total=total,
            max_possible=config.get("maxScore", 21),
            component_scores=component_scores,
        )

    def _calculate_component_score(self, component: dict, responses: dict, config: dict) -> float:
        comp_type = component.get("type", "item")

        if comp_type == "item":
            idx = component.get("questionIndex", 0)
            val = responses.get(idx)
            return self._to_float(val) or 0

        elif comp_type == "sum":
            total = 0.0
            for idx in component.get("questionIndices", []):
                val = responses.get(idx)
                num = self._to_float(val)
                if num is not None:
                    total += num
            return total

        elif comp_type == "sleep_efficiency":
            minutes_sleep = self._to_float(responses.get(component.get("minutesAsleepIndex", 5))) or 0
            minutes_bed = self._to_float(responses.get(component.get("minutesInBedIndex", 4))) or 0
            if minutes_bed > 0:
                efficiency = (minutes_sleep / minutes_bed) * 100
                if efficiency >= 85:
                    return 0
                elif efficiency >= 75:
                    return 1
                elif efficiency >= 65:
                    return 2
                else:
                    return 3
            return 0

        elif comp_type == "latency_sum":
            q1_val = self._to_float(responses.get(component.get("latencyIndex", 1))) or 0
            q5a_val = self._to_float(responses.get(component.get("item5aIndex", 5))) or 0
            combined = q1_val + q5a_val
            bands = component.get("scoringBands", [])
            for band in bands:
                if band["min"] <= combined <= band["max"]:
                    return band["score"]
            return 0

        elif comp_type == "duration":
            hours = self._to_float(responses.get(component.get("questionIndex", 4))) or 0
            if hours > 7:
                return 0
            elif hours >= 6:
                return 1
            elif hours >= 5:
                return 2
            else:
                return 3

        return 0

    def _score_profile_and_vas(self, responses: dict, config: dict) -> ScoreResult:
        dimension_scores = {}
        health_state_profile = ""
        vas_score = None

        for i, question in enumerate(config.get("questions", [])):
            val = responses.get(i)
            if question.get("type") == "visual-analogue-scale":
                vas_score = self._to_float(val)
            elif question.get("dimension"):
                num = self._to_float(val) if val is not None else None
                dimension_scores[question["dimension"]] = {
                    "label": question.get("question") or question.get("label", ""),
                    "level": num,
                    "max_level": 5,
                }
                health_state_profile += str(int(num)) if num is not None else "X"

        return ScoreResult(
            total=vas_score or 0,
            max_possible=100,
            extra={
                "health_state_profile": health_state_profile,
                "dimension_scores": dimension_scores,
                "vas_score": vas_score,
                "is_profile_based": True,
            },
        )

    def _score_asrs_screening(self, responses: dict, config: dict) -> ScoreResult:
        screening_threshold = config.get("screeningThreshold", 4)
        part_a_questions = config.get("partA", list(range(6)))
        screening_positive = 0
        question_scores = {}

        for idx in part_a_questions:
            val = responses.get(idx)
            if val is not None:
                questions = config.get("questions", [])
                q = questions[idx] if idx < len(questions) else {}
                option = next((o for o in q.get("options", []) if str(o.get("value")) == str(val)), None)
                if option and option.get("screeningPositive"):
                    screening_positive += 1
                    question_scores[idx] = 1
                else:
                    question_scores[idx] = 0

        return ScoreResult(
            total=screening_positive,
            max_possible=len(part_a_questions),
            question_scores=question_scores,
            extra={
                "is_positive_screen": screening_positive >= screening_threshold,
                "screening_threshold": screening_threshold,
            },
        )

    def _score_ibs_sss(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_sum(responses, config)

    def _score_paindetect(self, responses: dict, config: dict) -> ScoreResult:
        result = self._score_sum(responses, config)
        cutoff_unlikely = config.get("cutoffUnlikely", 12)
        cutoff_likely = config.get("cutoffLikely", 19)
        total = result.total
        if total <= cutoff_unlikely:
            classification = "unlikely"
        elif total >= cutoff_likely:
            classification = "likely"
        else:
            classification = "possible"
        result.extra["neuropathic_classification"] = classification
        return result

    def _score_pfs_dual(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_subscale_sum(responses, config)

    def _score_msq_transformed(self, responses: dict, config: dict) -> ScoreResult:
        return self._score_weighted_domain_sum(responses, config)

    # -------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------

    def _to_float(self, val: Any) -> Optional[float]:
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    def _get_option_points(self, question: dict, val: Any, default: float) -> float:
        options = question.get("options", [])
        option = next((o for o in options if str(o.get("value")) == str(val)), None)
        if option and "points" in option:
            return float(option["points"])
        return default

    def _compare(self, val: float, operator: str, threshold: float) -> bool:
        ops = {
            ">=": val >= threshold,
            ">": val > threshold,
            "<=": val <= threshold,
            "<": val < threshold,
            "==": val == threshold,
            "===": val == threshold,
        }
        return ops.get(operator, False)

    def _calc_max_score(self, config: dict) -> float:
        total = 0.0
        scored_questions = config.get("scoredQuestions")
        for i, q in enumerate(config.get("questions", [])):
            if scored_questions is not None and len(scored_questions) > 0 and i not in scored_questions:
                continue
            if q.get("scoredInTotal") is False or q.get("includeInScore") is False:
                continue
            if q.get("supplementary"):
                continue
            options = q.get("options", [])
            if options:
                max_points = max(
                    (o.get("points", o.get("value", 0)) for o in options),
                    default=0,
                )
                total += float(max_points)
        return total


# Singleton
scale_engine = ScaleEngine()
