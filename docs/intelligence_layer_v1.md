# Kaivo Intelligence Layer with UMI
Meta Ads only. Implementation plan for engineering.

## 1. Purpose
Kaivo Intelligence transforms raw Meta Ads reporting into:
- A single **UMI score (0-100)** per campaign (and optionally ad set, ad)
- A breakdown of **five cluster scores** that explain performance
- **Signals**: momentum, fatigue, efficiency drift
- **Recommendations**: increase, hold, decrease, refresh creative, adjust placements
- **Narratives** (optional phase): human-readable explanations for SMB and Agency users

UMI is the scoring engine inside Kaivo Intelligence.

---

## 2. Scope
### Included now
- Meta Ads only (Facebook/Instagram and Meta placements)
- Campaign-level UMI (required)
- Optional segment UMI:
  - publisher_platform
  - platform_position
  - device_platform
  - region/state
  - age/gender
  - daily time series

### Excluded now
- Non-Meta platforms
- Cross-platform baselines and attribution
- Real budget changes pushed to Meta (recommendations only unless already supported elsewhere)

---

## 3. Key definitions
### Entities
- **Campaign**: Meta campaign object in Kaivo
- **Reporting day**: metrics for date D in account timezone
- **Primary click metric**:
  - Default: `link_clicks`
  - Fallback: `outbound_clicks`
  - Fallback: `clicks`
- **Primary conversion metric**:
  - Configurable per campaign based on objective, pixel, or event selection
  - Examples: `purchase`, `lead`, `complete_registration`
- **Goal** (for scoring):
  - Awareness
  - Clicks
  - Conversions
  - Mixed (optional, uses weighted blend)

### Notation
Let daily aggregated values be:
- S = spend
- I = impressions
- R = reach
- C = primary clicks (from the click metric cascade)
- UC = unique clicks (if available)
- V = primary conversions
- REV = conversion value (if available)
- F = frequency

---

## 4. Meta data ingestion and storage
### 4.1 Data pulled from Meta API
Required daily metrics (campaign level):
- spend
- impressions
- reach
- clicks
- link_clicks
- outbound_clicks (if available)
- unique_clicks (if available)
- frequency (if provided, else compute)
- actions for selected conversion event(s)
- action_values for selected conversion value(s)
- video metrics if applicable (thruplay, 3s views, 25/50/75/95/100% views)

Recommended breakdown pulls (phase 2 depth):
- publisher_platform
- platform_position
- device_platform
- region/state
- age
- gender

### 4.2 Storage tables (conceptual)
1) `meta_metrics_daily_raw`
- campaign_id, date, breakdown_json, raw_metrics_json, pulled_at

2) `meta_metrics_daily_derived`
- campaign_id, date, breakdown_json
- derived fields (CTR, CPC, CPM, CVR, CPA, etc.)
- computed_at, version

3) `kaivo_intelligence_daily`
- campaign_id, date
- five cluster scores (0-100)
- UMI score (0-100)
- confidence (0-100)
- momentum flags, fatigue flags
- recommendation (enum) and rationale fields
- computed_at, model_version

4) `kaivo_intelligence_snapshot`
- campaign_id, range_start, range_end
- aggregated cluster scores, UMI, confidence
- segment winners/losers (if segmentation enabled)
- computed_at, model_version

---

## 5. Derived metrics (daily)
Compute daily derived metrics for each campaign (and optionally per breakdown segment).

### 5.1 Delivery
- Frequency:
  - If Meta provides frequency: use it
  - Else: F = I / R when R > 0

### 5.2 Engagement
- CTR: CTR = C / I when I > 0
- Unique CTR (if available): uCTR = UC / R when R > 0

### 5.3 Efficiency
- CPM: CPM = (S / I) * 1000 when I > 0
- CPC: CPC = S / C when C > 0
- CPA: CPA = S / V when V > 0

### 5.4 Conversion power
- CVR: CVR = V / C when C > 0
- ROAS (if REV available): ROAS = REV / S when S > 0
- Value per click (if REV available): VPC = REV / C when C > 0

### 5.5 Guardrails for nulls and zeros
- If denominator is 0, metric is null
- Keep nulls, do not force 0, because scoring uses confidence penalties

---

## 6. UMI architecture
UMI is computed as:

1) Compute five **cluster sub-scores** (0-100)
2) Apply **goal weights** to compute UMI_base (0-100)
3) Apply **trend adjustment** (momentum) and **risk penalties** (fatigue and instability)
4) Output final **UMI (0-100)** plus **confidence (0-100)**

---

## 7. Scoring time window
All scoring is computed over a configurable analysis window:
- Default: last 7 days (rolling)
- Alternatives:
  - 14 days for stability
  - 30 days for agency reporting

For a window W containing days d1..dn:
- Use sums for volume metrics: S_w, I_w, R_w, C_w, V_w, REV_w
- Use weighted averages where needed:
  - CTR_w = C_w / I_w
  - CVR_w = V_w / C_w
  - CPM_w = (S_w / I_w) * 1000
  - CPC_w = S_w / C_w
  - CPA_w = S_w / V_w
- Frequency_w: if daily frequency exists, use impressions-weighted average; else compute I_w / R_w if reach is window-unique and valid

---

## 8. Normalization and baselines (Meta-only)
To map raw derived metrics to 0-100 scores, UMI uses **robust normalization**.

### 8.1 Baseline source
For Meta-only v1, baselines come from Kaivo internal Meta history:
- All campaigns in Kaivo
- Same goal type if available
- Same industry or account tier if available (optional)
- If internal data is sparse: use account-level history only (advertiser account baselines)

### 8.2 Baseline statistics per metric
For each metric M, compute:
- p10, p50, p90 percentiles over the baseline population
- Optional p05 and p95 for tighter clipping

### 8.3 Normalize to 0-100
Define a generic percentile-based scoring function:

For "higher is better" metrics (CTR, CVR, ROAS, Reach efficiency):
- score_hi(M) = clamp( 100 * (M - p10) / (p90 - p10), 0, 100 )

For "lower is better" metrics (CPM, CPC, CPA, Frequency beyond optimal):
- score_lo(M) = clamp( 100 * (p90 - M) / (p90 - p10), 0, 100 )

If p90 == p10:
- fallback to:
  - score = 50 if M is not null
  - score = 0 if M is null

### 8.4 Clipping
Before scoring, clip M into [p05, p95] if those exist to reduce outlier influence.

---

## 9. The five cluster scores with formulas
Each cluster score is 0-100 and computed from normalized sub-metrics.

### 9.1 Visibility cluster
Goal: how effectively the campaign gets exposure.

Inputs (window level):
- Impressions volume: I_w
- Reach volume: R_w
- Frequency: F_w

Normalized components:
- reach_score = score_hi(R_w)
- impressions_score = score_hi(I_w)

Frequency is not strictly "higher is better". Use an optimal band:
- Define frequency sweet spot range:
  - Awareness: 1.2 to 3.0
  - Clicks: 1.5 to 4.0
  - Conversions: 2.0 to 6.0
- frequency_score:
  - If F_w is null: 50
  - If F_w within band: 100
  - If F_w below band: scale up linearly from 50 to 100
  - If F_w above band: penalty decays linearly from 100 down to 0 by a max cap (suggest cap 12)

Visibility cluster formula:
- Visibility = 0.45 * reach_score + 0.35 * impressions_score + 0.20 * frequency_score

### 9.2 Engagement cluster
Goal: how strongly people interact with the ad.

Inputs:
- CTR_w
- uCTR_w if available
- Optional: video completion rates if the campaign is video-heavy

Normalized components:
- ctr_score = score_hi(CTR_w)
- uctr_score = score_hi(uCTR_w) if uCTR_w exists else null
- video_score (optional) computed from completion metrics, else null

Engagement formula:
- If uctr_score is available:
  - Engagement = 0.70 * ctr_score + 0.30 * uctr_score
- Else:
  - Engagement = ctr_score

If video_score is available and objective is awareness/video:
- Engagement = 0.55 * ctr_score + 0.20 * uctr_score_or_50 + 0.25 * video_score

### 9.3 Conversion Power cluster
Goal: how effectively attention turns into desired actions.

Inputs:
- CVR_w
- V_w
- Optional: ROAS_w if value is available
- Optional: VPC if value is available

Normalized components:
- cvr_score = score_hi(CVR_w)
- conv_volume_score = score_hi(V_w)
- roas_score = score_hi(ROAS_w) if ROAS exists else null

Conversion Power formula:
- If ROAS available:
  - ConversionPower = 0.45 * cvr_score + 0.25 * conv_volume_score + 0.30 * roas_score
- Else:
  - ConversionPower = 0.60 * cvr_score + 0.40 * conv_volume_score

Fallback behavior when V_w is 0:
- CVR_w becomes 0, but do not automatically make ConversionPower 0.
- Use confidence penalties (Section 11) so early campaigns are not unfairly crushed.

### 9.4 Efficiency cluster
Goal: cost effectiveness for the chosen outcome.

Inputs:
- CPM_w
- CPC_w
- CPA_w if conversions exist

Normalized components:
- cpm_score = score_lo(CPM_w)
- cpc_score = score_lo(CPC_w)
- cpa_score = score_lo(CPA_w) if CPA exists else null

Efficiency formula depends on goal:
- Awareness:
  - Efficiency = cpm_score
- Clicks:
  - Efficiency = 0.70 * cpc_score + 0.30 * cpm_score
- Conversions:
  - If cpa_score exists:
    - Efficiency = 0.75 * cpa_score + 0.25 * cpc_score
  - Else:
    - Efficiency = cpc_score

### 9.5 Quality and Stability cluster
Goal: how reliable performance is and how safe it is to scale.

Compute daily series for the window:
- CTR_d, CPC_d, CVR_d, CPM_d, CPA_d where available

Volatility score per metric:
- For a metric X with daily values x1..xn:
  - mean_x = mean(x)
  - std_x = std(x)
  - CV_x = std_x / mean_x when mean_x > 0 else null
- Convert to stability score:
  - stability_x = score_lo(CV_x) using baseline percentiles of CV for that metric

Core stability metrics:
- stability_ctr
- stability_cpc
- stability_cvr (if conversions exist)

Frequency risk:
- freq_risk_score = frequency_score from Visibility

Quality formula:
- If conversions exist (V_w > 0):
  - Quality = 0.35 * stability_ctr + 0.30 * stability_cpc + 0.20 * stability_cvr + 0.15 * freq_risk_score
- Else:
  - Quality = 0.45 * stability_ctr + 0.35 * stability_cpc + 0.20 * freq_risk_score

---

## 10. Goal weights for UMI
UMI_base is a weighted sum of the five clusters.

### 10.1 Awareness goal
- Visibility: 40%
- Engagement: 30%
- Conversion Power: 10%
- Efficiency: 10%
- Quality and Stability: 10%

UMI_base_awareness =
0.40*Visibility + 0.30*Engagement + 0.10*ConversionPower + 0.10*Efficiency + 0.10*Quality

### 10.2 Clicks goal
- Visibility: 25%
- Engagement: 35%
- Conversion Power: 20%
- Efficiency: 15%
- Quality and Stability: 5%

UMI_base_clicks =
0.25*Visibility + 0.35*Engagement + 0.20*ConversionPower + 0.15*Efficiency + 0.05*Quality

### 10.3 Conversions goal
- Visibility: 10%
- Engagement: 20%
- Conversion Power: 45%
- Efficiency: 20%
- Quality and Stability: 5%

UMI_base_conversions =
0.10*Visibility + 0.20*Engagement + 0.45*ConversionPower + 0.20*Efficiency + 0.05*Quality

### 10.4 Mixed goal (optional)
Blend based on campaign objective:
- If objective is AWARENESS/REACH: use Awareness weights
- If objective is TRAFFIC: use Clicks weights
- If objective is SALES/LEADS: use Conversions weights
- Else: 33/33/34 blend of the three UMIs

---

## 11. Confidence score
Confidence communicates if Kaivo has enough data to trust the score.

Inputs:
- days_with_data in window
- spend_w
- impressions_w
- clicks_w
- conversions_w
- completeness ratio (missing fields)

Define thresholds (tunable):
- min_days = 5
- min_impressions = 5000
- min_clicks = 30 (for Clicks goal)
- min_conversions = 10 (for Conversions goal)
- min_spend = 50

Compute sub-scores (0-100):
- conf_days = clamp(100 * days_with_data / min_days, 0, 100)
- conf_impr = clamp(100 * impressions_w / min_impressions, 0, 100)
- conf_spend = clamp(100 * spend_w / min_spend, 0, 100)
- conf_clicks = clamp(100 * clicks_w / min_clicks, 0, 100) if goal is Clicks or Conversions
- conf_conv = clamp(100 * conversions_w / min_conversions, 0, 100) if goal is Conversions
- conf_fields = 100 - 100*(missing_required_fields / required_fields)

Confidence formula by goal:
- Awareness:
  - Confidence = 0.35*conf_days + 0.30*conf_impr + 0.20*conf_spend + 0.15*conf_fields
- Clicks:
  - Confidence = 0.30*conf_days + 0.20*conf_impr + 0.20*conf_spend + 0.20*conf_clicks + 0.10*conf_fields
- Conversions:
  - Confidence = 0.25*conf_days + 0.15*conf_impr + 0.15*conf_spend + 0.20*conf_clicks + 0.15*conf_conv + 0.10*conf_fields

Use Confidence to:
- Gate strong recommendations
- Add low-confidence badges
- Suppress harsh penalties when data is sparse

---

## 12. Momentum detection
Momentum tells if performance is improving or declining.

Compute UMI_daily for each day in window (same formulas but daily inputs).
Then compute:
- slope = linear regression slope of UMI_daily over time
- delta = (UMI_last3_avg - UMI_prev3_avg)

Momentum categories:
- Accelerating: delta >= +5
- Improving: delta between +2 and +5
- Stable: delta between -2 and +2
- Declining: delta between -5 and -2
- Falling fast: delta <= -5

Momentum impacts:
- Add a small adjustment to UMI_final:
  - Accelerating: +2
  - Improving: +1
  - Stable: 0
  - Declining: -1
  - Falling fast: -2
Only apply if Confidence >= 60.

---

## 13. Fatigue detection
Fatigue means performance is degrading due to creative saturation or audience exhaustion.

Signals (Meta-only):
- Frequency rising above band and CTR falling
- CTR drop over time with stable spend
- CPC increasing while CTR decreasing
- Conversion rate drop after a stable period

Fatigue rules over window:
- freq_flag if F_w > upper_band + 1
- ctr_drop_flag if CTR_last3_avg <= 0.75 * CTR_prev3_avg
- cpc_rise_flag if CPC_last3_avg >= 1.25 * CPC_prev3_avg

Fatigue levels:
- None: no flags
- Mild: any 1 flag
- Strong: any 2 flags
- Severe: all 3 flags

Fatigue impacts:
- Apply penalty to UMI_final:
  - Mild: -1
  - Strong: -3
  - Severe: -5
Only apply if Confidence >= 60.

---

## 14. UMI final computation
For the selected goal:
1) Compute clusters (0-100)
2) Compute UMI_base using goal weights
3) Apply momentum adjustment (Section 12)
4) Apply fatigue penalty (Section 13)
5) Clamp to [0, 100]

UMI_final = clamp(UMI_base + momentum_adj - fatigue_penalty, 0, 100)

---

## 15. Recommendations engine
Recommendations should be simple and consistent.

### 15.1 Recommendation outputs
- Increase budget
- Hold budget
- Decrease budget
- Refresh creative
- Fix conversion path
- Expand placements
- Tighten placements

### 15.2 Decision logic
Primary based on UMI_final, Confidence, and cluster drivers:

If Confidence < 50:
- Recommendation: Hold budget
- Rationale: Not enough data, wait for signal

Else if UMI_final >= 75:
- If Quality >= 60 and fatigue <= Mild:
  - Increase budget
- If fatigue is Strong or Severe:
  - Refresh creative (even if score is high)

Else if UMI_final between 55 and 75:
- Hold budget
- Suggest the top weak cluster:
  - Low Engagement: improve creative and hooks
  - Low Efficiency: adjust targeting/placements
  - Low ConversionPower: fix landing page or event quality

Else if UMI_final < 55:
- If Engagement high but ConversionPower low:
  - Fix conversion path
- If Efficiency very low:
  - Decrease budget
- If Frequency high and Engagement falling:
  - Refresh creative

Rationale fields returned with recommendation:
- top_strength_cluster
- top_weakness_cluster
- 2-3 metric callouts (CTR, CPC, CVR, Frequency) from the scoring window

---

## 16. API endpoints for Kaivo Intelligence
All endpoints are Kaivo internal APIs.

### 16.1 Run intelligence for a campaign
- POST `/kaivo/intelligence/analyze`
Request:
- campaign_id
- date_range (start, end) or window_days
- goal (optional, else infer)
Response:
- UMI_final, UMI_base
- five cluster scores
- confidence
- momentum label + delta
- fatigue level
- recommendation + rationale

### 16.2 Get cached intelligence snapshot
- GET `/kaivo/intelligence/snapshot?campaign_id=...&window_days=...`
Response:
- last computed snapshot, timestamps, model_version

### 16.3 Get daily series for charts
- GET `/kaivo/intelligence/timeseries?campaign_id=...&metric=umi|ctr|cpc|cvr|freq`
Response:
- [{date, value}]

### 16.4 Get segment leaderboard (optional phase)
- GET `/kaivo/intelligence/segments?campaign_id=...&dimension=publisher_platform|platform_position|device_platform`
Response:
- list of segments ranked by UMI and key metrics

---

## 17. Jobs and scheduling
### 17.1 Meta sync job
- Frequency: daily (minimum), optionally hourly for spend and impressions
- Pull yesterday and the last 7 days (backfill for delays)

### 17.2 Intelligence compute job
- Frequency: daily after sync completes
- Computes:
  - daily derived metrics
  - daily UMI and snapshot UMI for each active campaign
  - stores results into `kaivo_intelligence_daily` and `kaivo_intelligence_snapshot`

### 17.3 Baseline refresh job
- Frequency: weekly
- Recompute percentiles p10/p50/p90 per metric for Meta-only baselines

---

## 18. Frontend UX requirements
Kaivo Intelligence must feel simple.

### 18.1 Campaign Performance tab integration
Add a Kaivo Intelligence section at top:
- UMI score big number (0-100) with label: Good, Fair, Poor
- Confidence badge: High, Medium, Low
- Recommendation card: single sentence + action label
- Momentum indicator: Improving, Stable, Declining
- Fatigue indicator: None, Mild, Strong, Severe

### 18.2 Cluster breakdown
Show five clusters as horizontal bars with:
- score
- 1-line tooltip explanation per cluster

### 18.3 Metric callouts
Show 4 key metrics for the goal:
- Awareness: Reach, Frequency, CPM, CTR
- Clicks: Clicks, CTR, CPC, Frequency
- Conversions: Conversions, CVR, CPA, Frequency

### 18.4 Time series chart
Line chart toggle:
- UMI over time
- CTR over time
- CPC over time
- CVR over time
- Frequency over time

### 18.5 Segment winners and losers (optional phase)
Leaderboard table by dimension, default:
- publisher_platform
Then allow switching dimension via dropdown.

---

## 19. Testing requirements
### 19.1 Unit tests
- Derived metric correctness (division by zero, null handling)
- Normalization scoring (p10/p90 behavior, clipping, constant distributions)
- Cluster score formulas
- Goal weights produce expected results
- Confidence score thresholds
- Momentum and fatigue rules

### 19.2 Golden test fixtures
Create 6 synthetic campaign scenarios and assert UMI outcomes:
1) High CTR low CPC, moderate frequency, no conversions
2) High conversions and strong CPA, low CTR
3) Rising frequency with falling CTR (fatigue)
4) Sparse data low confidence
5) Volatile CTR (low Quality)
6) Improving trend with stable efficiency (momentum)

---

## 20. Implementation phases
### Phase 1
- Meta ingestion + raw storage
- Derived metrics
- Baselines and normalization
- Cluster scoring
- UMI_base and UMI_final
- Confidence score
- Snapshot API
- Campaign Performance tab showing UMI + clusters

### Phase 2
- Momentum and fatigue
- Recommendations + rationales
- Time series charts
- Segment leaderboard

### Phase 3
- Natural language narratives for SMB and Agency modes
- What-if simulator using UMI recomputation under budget shifts (read-only simulation)

---

## 21. Success criteria
For Meta-only launch:
- Every active Meta campaign has a daily UMI score computed and stored
- UMI is stable across days for stable campaigns (Quality reflects this)
- Low data campaigns show low confidence and avoid aggressive recommendations
- UMI score correlates with human judgment:
  - Higher CTR and lower CPC improves Click goal UMI
  - Better CPA and higher CVR improves Conversion goal UMI
  - Reach and stable frequency improves Awareness goal UMI
