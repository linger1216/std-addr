"""
CRF 层数值正确性单测 —— 用穷举法对照前向算法 / 路径得分 / Viterbi 解码。

核心算法正确性保障:任何对 CRF 的改动(转移矩阵、mask 处理、解码)都必须通过这些用例。
场景:
  - 单样本全有效序列
  - 多样本不同长度 batch(含 padding)
"""

import itertools
import math

import pytest

torch = pytest.importorskip("torch")

from train.bert_crf import CRF


def _logsumexp_of_all_paths(crf, emissions, mask):
    """穷举所有合法路径的得分,返回 logZ(逐样本)。"""
    log_zs = []
    for b in range(emissions.size(0)):
        length = int(mask[b].sum())
        terms = []
        for path in itertools.product(range(crf.num_tags), repeat=length):
            s = crf.start_transitions[path[0]].item()
            for t in range(1, length):
                s += crf.transitions[path[t - 1], path[t]].item()
            s += crf.end_transitions[path[-1]].item()
            for t in range(length):
                s += emissions[b, t, path[t]].item()
            terms.append(math.exp(s))
        log_zs.append(math.log(sum(terms)))
    return log_zs


def _best_path_bruteforce(crf, emissions, mask):
    """穷举最优路径(逐样本)。"""
    bests = []
    for b in range(emissions.size(0)):
        length = int(mask[b].sum())
        best_score = -1e18
        best_path = None
        for path in itertools.product(range(crf.num_tags), repeat=length):
            s = crf.start_transitions[path[0]].item()
            for t in range(1, length):
                s += crf.transitions[path[t - 1], path[t]].item()
            s += crf.end_transitions[path[-1]].item()
            for t in range(length):
                s += emissions[b, t, path[t]].item()
            if s > best_score:
                best_score, best_path = s, path
        bests.append(list(best_path))
    return bests


def _score_sentence_bruteforce(crf, emissions, tags, mask):
    """手工计算指定标签路径的得分。"""
    scores = []
    for b in range(emissions.size(0)):
        length = int(mask[b].sum())
        path = tags[b, :length].tolist()
        s = crf.start_transitions[path[0]].item()
        for t in range(1, length):
            s += crf.transitions[path[t - 1], path[t]].item()
        s += crf.end_transitions[path[-1]].item()
        for t in range(length):
            s += emissions[b, t, path[t]].item()
        scores.append(s)
    return scores


def _make_crf(num_tags=4, seed=0, scale=0.1):
    """固定参数的 CRF(scale 控制分数尺度,避免数值溢出)。"""
    torch.manual_seed(seed)
    crf = CRF(num_tags)
    with torch.no_grad():
        crf.transitions.copy_(torch.randn(num_tags, num_tags) * scale)
        crf.start_transitions.copy_(torch.randn(num_tags) * scale)
        crf.end_transitions.copy_(torch.randn(num_tags) * scale)
    return crf


def test_logZ_前向算法与穷举一致():
    torch.manual_seed(1)
    crf = _make_crf(num_tags=4)
    emissions = torch.randn(1, 4, 4)
    mask = torch.ones(1, 4, dtype=torch.long)

    brute = _logsumexp_of_all_paths(crf, emissions, mask)
    alg = crf._forward_algorithm(emissions, mask).tolist()
    assert brute == pytest.approx(alg, rel=1e-4, abs=1e-4)


def test_logZ_padding批量与穷举一致():
    torch.manual_seed(2)
    crf = _make_crf(num_tags=3, scale=0.05)
    emissions = torch.randn(2, 5, 3)
    mask = torch.tensor([[1, 1, 1, 1, 0], [1, 1, 0, 0, 0]])

    brute = _logsumexp_of_all_paths(crf, emissions, mask)
    alg = crf._forward_algorithm(emissions, mask).tolist()
    assert brute == pytest.approx(alg, rel=1e-4, abs=1e-4)


def test_score_sentence与手工路径一致():
    torch.manual_seed(3)
    crf = _make_crf(num_tags=3, scale=0.05)
    emissions = torch.randn(2, 5, 3)
    mask = torch.tensor([[1, 1, 1, 1, 0], [1, 1, 0, 0, 0]])
    tags = torch.tensor([[1, 1, 1, 1, 0], [2, 2, 0, 0, 0]])

    hand = _score_sentence_bruteforce(crf, emissions, tags, mask)
    alg = crf._score_sentence(emissions, tags, mask).tolist()
    assert hand == pytest.approx(alg, rel=1e-4, abs=1e-4)


def test_decode与穷举最优路径一致():
    torch.manual_seed(4)
    crf = _make_crf(num_tags=4, scale=0.05)
    emissions = torch.randn(2, 5, 4)
    mask = torch.tensor([[1, 1, 1, 1, 0], [1, 1, 1, 0, 0]])

    brute = _best_path_bruteforce(crf, emissions, mask)
    decoded = crf.decode(emissions, mask)
    assert decoded == brute
    # 解码长度 = 每样本有效 token 数
    assert [len(d) for d in decoded] == [int(m.sum()) for m in mask]


def test_loss_符号与数值():
    """loss = -mean(loglik),loglik = score - logZ;随机路径下 loss 应为正。"""
    torch.manual_seed(5)
    crf = _make_crf(num_tags=3, scale=0.1)
    emissions = torch.randn(2, 5, 3)
    mask = torch.tensor([[1, 1, 1, 1, 0], [1, 1, 1, 1, 1]])
    tags = torch.randint(0, 3, (2, 5))

    loss = crf(emissions, tags, mask)
    # 逐样本 loglik
    loglik = (
        crf._score_sentence(emissions, tags, mask)
        - crf._forward_algorithm(emissions, mask)
    )
    assert loss.item() == pytest.approx(-loglik.mean().item(), rel=1e-4, abs=1e-4)
    assert loss.item() > 0  # 随机参数下任何路径得分几乎不可能超过配分函数


def test_loss_最优路径处较小():
    """模型收敛方向:给定一条比其他高得多的路径,loss 应趋近 0。"""
    crf = _make_crf(num_tags=3, scale=0.05)
    with torch.no_grad():
        # 制造强先验:标签 1 → 标签 1 转移 +10,让路径 [1,1,...] 明显更优
        crf.transitions[1, 1].add_(10.0)
    emissions = torch.zeros(1, 3, 3)
    mask = torch.ones(1, 3, dtype=torch.long)
    tags = torch.tensor([[1, 1, 1]])

    loss = crf(emissions, tags, mask)
    # 最优路径 [1,1,1] 的得分约 20(两次转移),配分函数 ≈ exp(20),loglik ≈ 0
    assert 0.0 <= loss.item() < 0.01


def test_decode_空mask防御():
    """全 0 mask(空序列,不应出现在训练中)不应崩溃。"""
    crf = _make_crf(num_tags=3)
    emissions = torch.zeros(1, 4, 3)
    mask = torch.zeros(1, 4, dtype=torch.long)
    # decode:last_idx = -1 → clamp 场景,至少不抛 IndexError
    decoded = crf.decode(emissions, mask)
    assert len(decoded[0]) >= 1