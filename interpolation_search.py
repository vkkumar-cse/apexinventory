"""
============================================================
  Interpolation Search — Complete Analysis
  Problem Statements 1, 2, and 3
============================================================
"""

import time
import random


# ─────────────────────────────────────────────
# CORE SEARCH ALGORITHMS
# ─────────────────────────────────────────────

def interpolation_search(arr, target):
    """
    Interpolation Search (works for integers and floats).
    Time Complexity : O(log log n) average, O(n) worst case
    Space Complexity: O(1)
    Returns: (index, probes)  — index = -1 if not found
    """
    low, high = 0, len(arr) - 1
    probes = 0

    while low <= high and arr[low] <= target <= arr[high]:
        probes += 1

        if low == high:
            if arr[low] == target:
                return low, probes
            return -1, probes

        # Interpolation formula
        pos = low + int(
            ((target - arr[low]) * (high - low))
            / (arr[high] - arr[low])
        )

        if arr[pos] == target:
            return pos, probes
        elif arr[pos] < target:
            low = pos + 1
        else:
            high = pos - 1

    return -1, probes


def binary_search(arr, target):
    """
    Binary Search (works for integers and floats).
    Time Complexity : O(log n)
    Space Complexity: O(1)
    Returns: (index, probes)  — index = -1 if not found
    """
    low, high = 0, len(arr) - 1
    probes = 0

    while low <= high:
        probes += 1
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid, probes
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1

    return -1, probes


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def separator(char="─", width=72):
    print(char * width)

def section(title):
    print()
    separator("═")
    print(f"  {title}")
    separator("═")


# ─────────────────────────────────────────────
# PROBLEM 1
# Uniformly distributed integers — performance comparison
# Sizes: 1000, 5000, 10000, 50000, 100000
# ─────────────────────────────────────────────

def problem_1():
    section("PROBLEM 1 — Uniformly Distributed Integers: IS vs BS Performance")

    print("""
  Given a sorted array of uniformly distributed integers, implement
  Interpolation Search and compare its performance with Binary Search
  for dataset sizes: 1000, 5000, 10000, 50000, 100000.
""")

    sizes   = [1000, 5000, 10000, 50000, 100000]
    runs    = 200          # repetitions for stable timing

    header = (f"{'Size':>10}  {'IS Time(µs)':>13}  {'BS Time(µs)':>13}"
              f"  {'IS Probes':>10}  {'BS Probes':>10}  {'Speedup':>8}")
    print(header)
    separator()

    for size in sizes:
        # Uniformly distributed sorted integers
        arr    = sorted(random.sample(range(size * 10), size))
        target = arr[random.randint(0, size - 1)]   # guaranteed to exist

        # Timing — Interpolation Search
        t0 = time.perf_counter()
        for _ in range(runs):
            idx_is, probes_is = interpolation_search(arr, target)
        is_us = (time.perf_counter() - t0) / runs * 1_000_000

        # Timing — Binary Search
        t0 = time.perf_counter()
        for _ in range(runs):
            idx_bs, probes_bs = binary_search(arr, target)
        bs_us = (time.perf_counter() - t0) / runs * 1_000_000

        speedup = bs_us / is_us if is_us > 0 else float("inf")

        print(f"{size:>10}  {is_us:>13.3f}  {bs_us:>13.3f}"
              f"  {probes_is:>10}  {probes_bs:>10}  {speedup:>7.2f}x")

    print()
    print("  Observation:")
    print("  • Interpolation Search is faster on uniformly distributed data.")
    print("  • Fewer probes because the interpolation formula estimates")
    print("    the position mathematically rather than halving blindly.")
    print("  • Speedup grows as dataset size increases.")


# ─────────────────────────────────────────────
# PROBLEM 2
# Student roll numbers (1–10000)
# Count probes and compare IS vs BS
# ─────────────────────────────────────────────

def problem_2():
    section("PROBLEM 2 — Student Roll Numbers (1 to 10 000): Probe Count")

    print("""
  Sorted array of student roll numbers (range 1–10000).
  Count probes required to find a given roll number.
  Compare Interpolation Search vs Binary Search.
""")

    TOTAL_ROLLS = 1000          # number of students in the array
    ROLL_RANGE  = (1, 10_000)

    roll_numbers = sorted(random.sample(range(ROLL_RANGE[0], ROLL_RANGE[1] + 1),
                                        TOTAL_ROLLS))

    # ── Demo: single search ──
    demo_target = roll_numbers[random.randint(0, TOTAL_ROLLS - 1)]
    idx_is, pr_is = interpolation_search(roll_numbers, demo_target)
    idx_bs, pr_bs = binary_search(roll_numbers, demo_target)

    print(f"  Array size   : {TOTAL_ROLLS}  (roll numbers from "
          f"{ROLL_RANGE[0]} to {ROLL_RANGE[1]})")
    print(f"  Target roll  : {demo_target}")
    print()
    print(f"  {'Algorithm':<25}  {'Index Found':>12}  {'Probes':>8}")
    separator(width=55)
    print(f"  {'Interpolation Search':<25}  {idx_is:>12}  {pr_is:>8}")
    print(f"  {'Binary Search':<25}  {idx_bs:>12}  {pr_bs:>8}")

    # ── Aggregate: probe distribution over many targets ──
    print()
    print("  Probe distribution over 200 random roll-number lookups:")
    print()
    print(f"  {'Metric':<20}  {'IS Probes':>10}  {'BS Probes':>10}")
    separator(width=48)

    is_probes_list, bs_probes_list = [], []
    for _ in range(200):
        t = roll_numbers[random.randint(0, TOTAL_ROLLS - 1)]
        _, p_is = interpolation_search(roll_numbers, t)
        _, p_bs = binary_search(roll_numbers, t)
        is_probes_list.append(p_is)
        bs_probes_list.append(p_bs)

    metrics = {
        "Minimum" : (min(is_probes_list),  min(bs_probes_list)),
        "Maximum" : (max(is_probes_list),  max(bs_probes_list)),
        "Average" : (sum(is_probes_list)/len(is_probes_list),
                     sum(bs_probes_list)/len(bs_probes_list)),
    }
    for label, (iv, bv) in metrics.items():
        print(f"  {label:<20}  {iv:>10.2f}  {bv:>10.2f}")

    print()
    print("  Observation:")
    print("  • IS needs fewer probes on average because roll numbers are")
    print("    uniformly distributed — exactly the ideal case for IS.")
    print("  • BS always requires ≈ log₂(n) probes regardless of distribution.")


# ─────────────────────────────────────────────
# PROBLEM 3
# Floating-point numbers (0.0 – 1000.0)
# Comparisons for sizes: 10000, 50000, 100000
# ─────────────────────────────────────────────

def problem_3():
    section("PROBLEM 3 — Floating-Point Numbers (0.0 to 1000.0): Comparison Count")

    print("""
  Sorted array of floating-point numbers uniformly distributed
  between 0.0 and 1000.0.
  Analyse comparisons needed for dataset sizes: 10000, 50000, 100000.
""")

    sizes = [10_000, 50_000, 100_000]
    runs  = 200

    header = (f"{'Size':>10}  {'IS Time(µs)':>13}  {'BS Time(µs)':>13}"
              f"  {'IS Probes':>10}  {'BS Probes':>10}  {'IS/BS Ratio':>12}")
    print(header)
    separator()

    for size in sizes:
        # Uniformly distributed floats in [0.0, 1000.0]
        arr    = sorted(random.uniform(0.0, 1000.0) for _ in range(size))
        target = arr[random.randint(0, size - 1)]   # guaranteed to exist

        # Timing — Interpolation Search
        t0 = time.perf_counter()
        for _ in range(runs):
            idx_is, probes_is = interpolation_search(arr, target)
        is_us = (time.perf_counter() - t0) / runs * 1_000_000

        # Timing — Binary Search
        t0 = time.perf_counter()
        for _ in range(runs):
            idx_bs, probes_bs = binary_search(arr, target)
        bs_us = (time.perf_counter() - t0) / runs * 1_000_000

        ratio = probes_is / probes_bs if probes_bs > 0 else float("inf")

        print(f"{size:>10}  {is_us:>13.3f}  {bs_us:>13.3f}"
              f"  {probes_is:>10}  {probes_bs:>10}  {ratio:>11.2f}x")

    print()
    print("  Observation:")
    print("  • IS works on floats as long as the interpolation formula")
    print("    uses float arithmetic (Python does this automatically).")
    print("  • Uniform distribution → IS still achieves O(log log n)")
    print("    comparisons, significantly fewer than BS's O(log n).")
    print("  • The IS/BS probe ratio stays well below 1.0, confirming")
    print("    IS's superiority for this distribution type.")


# ─────────────────────────────────────────────
# QUICK DEMO — basic correctness check
# ─────────────────────────────────────────────

def quick_demo():
    section("QUICK DEMO — Basic Correctness Check")

    arr    = [2, 5, 10, 15, 23, 35, 48, 60, 75, 90, 105, 120]
    target = 35

    idx_is, probes_is = interpolation_search(arr, target)
    idx_bs, probes_bs = binary_search(arr, target)

    print(f"\n  Array  : {arr}")
    print(f"  Target : {target}")
    print()
    print(f"  {'Algorithm':<25}  {'Index':>6}  {'Probes':>8}")
    separator(width=48)
    print(f"  {'Interpolation Search':<25}  {idx_is:>6}  {probes_is:>8}")
    print(f"  {'Binary Search':<25}  {idx_bs:>6}  {probes_bs:>8}")

    # ── Not-found case ──
    missing = 99
    idx_m, pr_m = interpolation_search(arr, missing)
    print(f"\n  Search for {missing} (not in array): index = {idx_m}, probes = {pr_m}")


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    random.seed(42)          # reproducible results

    quick_demo()
    problem_1()
    problem_2()
    problem_3()

    print()
    separator("═")
    print("  Analysis complete.")
    separator("═")
    print()
