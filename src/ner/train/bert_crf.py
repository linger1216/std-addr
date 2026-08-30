"""
BERT-CRF 模型定义 — 真实 CRF 层（转移矩阵 + Viterbi 解码）
"""
import torch
import torch.nn as nn
from transformers import BertModel

from core.paths import BASE_MODEL_DIR


class CRF(nn.Module):
    """条件随机场层"""

    def __init__(self, num_tags: int):
        super().__init__()
        self.num_tags = num_tags
        # 转移矩阵: transitions[i][j] = 从标签 i 转移到 j 的得分
        # 零初始化比 randn 更稳:避免训练初期 B→I 等转移有随机强先验
        self.transitions = nn.Parameter(torch.zeros(num_tags, num_tags))
        self.start_transitions = nn.Parameter(torch.zeros(num_tags))
        self.end_transitions = nn.Parameter(torch.zeros(num_tags))

    def forward(self, emissions: torch.Tensor, tags: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """计算负对数似然损失

        Args:
            emissions: 发射分数 [batch, seq_len, num_tags]
            tags: 真实标签 [batch, seq_len]
            mask: 有效位置掩码 [batch, seq_len], 1=有效, 0=padding

        Returns:
            负对数似然损失（标量）
        """
        log_likelihood = self._compute_log_likelihood(emissions, tags, mask)
        return -log_likelihood.mean()

    def _compute_log_likelihood(self, emissions: torch.Tensor, tags: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """计算对数似然 = 真实路径得分 - log 配分函数"""
        score = self._score_sentence(emissions, tags, mask)
        log_norm = self._forward_algorithm(emissions, mask)
        return score - log_norm

    def _score_sentence(self, emissions: torch.Tensor, tags: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """计算真实标签路径的得分"""
        batch_size, seq_len = tags.shape

        # 起始转移得分
        score = self.start_transitions[tags[:, 0]]  # [batch]

        # 转移得分（向量化）
        prev_tags = tags[:, :-1]  # [batch, seq_len-1]
        curr_tags = tags[:, 1:]   # [batch, seq_len-1]
        trans_scores = self.transitions[prev_tags, curr_tags]  # [batch, seq_len-1]
        trans_mask = mask[:, 1:].float()
        score += (trans_scores * trans_mask).sum(dim=1)

        # 终止转移得分
        last_idx = mask.sum(dim=1) - 1  # [batch], 最后一个有效位置的索引
        batch_idx = torch.arange(batch_size, device=tags.device)
        # 处理 mask 全为 0 的极端情况（不应发生）
        last_idx = last_idx.clamp(min=0)
        score += self.end_transitions[tags[batch_idx, last_idx]]

        # 发射得分（向量化）
        seq_idx = torch.arange(seq_len, device=tags.device).unsqueeze(0)  # [1, seq_len]
        batch_idx_2d = batch_idx.unsqueeze(1)  # [batch, 1]
        emit_scores = emissions[batch_idx_2d, seq_idx, tags]  # [batch, seq_len]
        score += (emit_scores * mask.float()).sum(dim=1)

        return score

    def _forward_algorithm(self, emissions: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """前向算法计算配分函数（log-sum-exp of all paths）"""
        batch_size, seq_len, num_tags = emissions.shape
        mask_bool = mask.bool()

        # 初始: [batch, num_tags] = start_transitions + 第一个位置的发射分数
        alpha = self.start_transitions.unsqueeze(0) + emissions[:, 0]  # [batch, num_tags]

        for t in range(1, seq_len):
            # score[b, i, j] = alpha[b, i] + transitions[i, j] + emissions[b, t, j]
            emit = emissions[:, t].unsqueeze(1)       # [batch, 1, num_tags]
            trans = self.transitions.unsqueeze(0)     # [1, num_tags, num_tags]
            alpha_exp = alpha.unsqueeze(2)            # [batch, num_tags, 1]
            scores = alpha_exp + trans + emit         # [batch, num_tags, num_tags]
            next_alpha = torch.logsumexp(scores, dim=1)  # [batch, num_tags]

            # 有效位置更新，无效位置保持
            alpha = torch.where(mask_bool[:, t].unsqueeze(1), next_alpha, alpha)

        # 终止转移(循环内 where 已屏蔽 padding,此处 alpha 即最后有效位置的值)
        alpha = alpha + self.end_transitions.unsqueeze(0)  # [batch, num_tags]
        return torch.logsumexp(alpha, dim=1)  # [batch]

    def decode(self, emissions: torch.Tensor, mask: torch.Tensor) -> list:
        """Viterbi 解码，返回最优标签序列（list of list，长度=每样本有效 token 数）"""
        batch_size, seq_len, num_tags = emissions.shape
        mask_bool = mask.bool()

        # 初始化
        score = self.start_transitions.unsqueeze(0) + emissions[:, 0]  # [batch, num_tags]

        # 保存回溯路径
        backpointers = []

        for t in range(1, seq_len):
            # [batch, num_tags, num_tags]
            scores = score.unsqueeze(2) + self.transitions.unsqueeze(0) + emissions[:, t].unsqueeze(1)
            max_scores, max_tags = scores.max(dim=1)  # [batch, num_tags]
            backpointers.append(max_tags)

            score = torch.where(mask_bool[:, t].unsqueeze(1), max_scores, score)

        # 终止转移
        score = score + self.end_transitions.unsqueeze(0)  # [batch, num_tags]

        # 回溯:只回溯到最后一个有效位置,避免 padding 段(噪声 backpointer)污染路径
        best_tags: list = []
        for b in range(batch_size):
            last_idx = int(mask[b].sum()) - 1  # 最后一个有效位置的索引(>=0,含 [CLS])
            # score 经 where 保持后即"最后有效位置"的分数向量
            best_last = score[b].argmax().item()
            tags = [best_last]
            for t in range(last_idx, 0, -1):
                tags.append(backpointers[t - 1][b, tags[-1]].item())
            tags.reverse()
            best_tags.append(tags)

        return best_tags


class BertCRF(nn.Module):
    """BERT + BiLSTM + CRF 地址 NER 模型"""

    def __init__(
        self,
        bert_model_name: str = str(BASE_MODEL_DIR),
        num_tags: int = 45,
        dropout: float = 0.1,
        lstm_hidden: int = 256,
        lstm_layers: int = 1,
    ):
        super().__init__()

        self.bert = BertModel.from_pretrained(bert_model_name, local_files_only=True)
        self.hidden_size = self.bert.config.hidden_size

        self.dropout = nn.Dropout(dropout)

        # BiLSTM 层
        self.lstm = nn.LSTM(
            input_size=self.hidden_size,
            hidden_size=lstm_hidden,
            num_layers=lstm_layers,
            batch_first=True,
            bidirectional=True,
        )

        # 映射层
        self.lstm_proj = nn.Linear(lstm_hidden * 2, lstm_hidden)

        # 发射分数层
        self.classifier = nn.Linear(lstm_hidden, num_tags)

        # CRF 层
        self.crf = CRF(num_tags)

    def forward(
        self, input_ids: torch.Tensor, attention_mask: torch.Tensor, tags: torch.Tensor = None
    ):
        """
        Args:
            input_ids: [batch, seq_len]
            attention_mask: [batch, seq_len]
            tags: [batch, seq_len]（训练时需要）

        Returns:
            训练: (loss, emissions)
            推理: 解码结果 (list of list)
        """
        # BERT 编码
        bert_output = self.bert(input_ids=input_ids, attention_mask=attention_mask)
        sequence_output = bert_output.last_hidden_state  # [batch, seq_len, hidden]
        sequence_output = self.dropout(sequence_output)

        # BiLSTM
        lstm_output, _ = self.lstm(sequence_output)  # [batch, seq_len, lstm_hidden*2]
        lstm_output = self.lstm_proj(lstm_output)
        lstm_output = torch.tanh(lstm_output)
        lstm_output = self.dropout(lstm_output)

        # 发射分数
        emissions = self.classifier(lstm_output)  # [batch, seq_len, num_tags]

        mask = attention_mask.bool()

        if tags is not None:
            # CRF 损失
            loss = self.crf(emissions, tags, mask)
            return loss, emissions
        else:
            # Viterbi 解码
            predictions = self.crf.decode(emissions, mask)
            return predictions

    def decode(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> list:
        """推理解码"""
        return self.forward(input_ids, attention_mask)


def get_model(
    num_tags: int,
    model_name: str = str(BASE_MODEL_DIR),
    dropout: float = 0.1,
    lstm_hidden: int = 256,
    lstm_layers: int = 1,
    device: str = None,
) -> BertCRF:
    """创建 BERT-CRF 模型"""
    model = BertCRF(
        bert_model_name=model_name,
        num_tags=num_tags,
        dropout=dropout,
        lstm_hidden=lstm_hidden,
        lstm_layers=lstm_layers,
    )

    if device:
        model = model.to(device)

    return model