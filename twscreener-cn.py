import tradingview_screener as tvs
import pandas as pd
import numpy as np
from scipy import stats
import akshare as ak
import time
import glob
import json


def focused_fcf_turnover_screener():
    """
    专注自由现金流边际和资产周转率的选股器
    其他指标用于验证盈利质量和估值合理性
    """

    # 获取数据
    broad_query = (tvs.Query()
        .set_markets('china')
        .select(
            'name', 'description', 'market_cap_basic',
            # 核心指标
            'free_cash_flow_margin_ttm',
            'asset_turnover_current',
            # 盈利质量验证
            'net_income_ttm', 'operating_margin', 'gross_margin',
            'return_on_equity', 'return_on_assets',
            # 增长验证
            'total_revenue_yoy_growth_ttm', 'net_income_yoy_growth_ttm',
            'free_cash_flow_yoy_growth_ttm',
            # 财务健康验证
            'debt_to_equity', 'current_ratio', 'quick_ratio',
            # 估值验证
            'price_earnings_ttm', 'price_book_ratio', 'price_sales_ratio',
            'price_earnings_growth_ttm',  # PEG指标
            # 技术指标
            'Recommend.All', 'Recommend.All|1W',
            'Recommend.MA', 'Recommend.MA|1W',
            'Recommend.Other', 'Recommend.Other|1W',
            # 基本信息
            'sector', 'industry', 'exchange', 'close', 'volume'
        )
        .where(
            tvs.col('type') == 'stock',
            tvs.col('market_cap_basic') > 1000000000,  # 市值 > 10亿
            tvs.col('total_revenue_ttm') > 0,  # 有营业收入
            tvs.col('net_income_ttm') > 0  # 净利润为正
        )
        .limit(3000)
    )

    broad_count, broad_data = broad_query.get_scanner_data()

    if broad_data.empty:
        print("未获取到足够数据进行行业分析")
        return 0, pd.DataFrame()

    # 行业标准化函数
    def industry_normalization(df, metrics):
        normalized_df = df.copy()

        for sector in df['sector'].unique():
            sector_mask = df['sector'] == sector
            sector_data = df[sector_mask]

            for metric in metrics:
                if metric in df.columns:
                    sector_values = sector_data[metric].dropna()
                    if len(sector_values) > 5:
                        normalized_df.loc[sector_mask, f'{metric}_industry_rank'] = (
                            sector_data[metric].rank(pct=True) * 100
                        )
                    else:
                        normalized_df.loc[sector_mask, f'{metric}_industry_rank'] = (
                            df[metric].rank(pct=True) * 100
                        )

        return normalized_df

    # 核心指标 + 验证指标
    key_metrics = [
        # 核心指标
        'free_cash_flow_margin_ttm',
        'asset_turnover_current',
        # 盈利质量验证
        'operating_margin',
        'return_on_equity',
        # 增长验证
        'total_revenue_yoy_growth_ttm',
        'net_income_yoy_growth_ttm',
        # 财务健康验证
        'debt_to_equity',
        # 估值验证
        'price_earnings_ttm',
        'price_earnings_growth_ttm'  # PEG
    ]

    # 应用行业标准化
    normalized_data = industry_normalization(broad_data, key_metrics)

    def calculate_focused_score(row):
        """
        专注FCF边际和资产周转率的评分体系
        """
        score = 0

        try:
            # 🎯 核心策略指标 - 70%权重
            # FCF边际行业排名 (35%)
            fcf_rank = row.get('free_cash_flow_margin_ttm_industry_rank', 0)
            score += min(fcf_rank * 0.35, 35)

            # 资产周转率行业排名 (35%)
            turnover_rank = row.get('asset_turnover_current_industry_rank', 0)
            score += min(turnover_rank * 0.35, 35)

            # ✅ 盈利质量验证 - 15%权重
            # 运营利润率行业排名 (10%)
            op_margin_rank = row.get('operating_margin_industry_rank', 0)
            score += min(op_margin_rank * 0.10, 10)

            # ROE行业排名 (5%)
            roe_rank = row.get('return_on_equity_industry_rank', 0)
            score += min(roe_rank * 0.05, 5)

            # 📈 增长验证 - 10%权重
            # 收入增长行业排名 (5%)
            revenue_growth_rank = row.get('total_revenue_yoy_growth_ttm_industry_rank', 0)
            score += min(revenue_growth_rank * 0.05, 5)

            # 净利润增长行业排名 (5%)
            net_income_growth_rank = row.get('net_income_yoy_growth_ttm_industry_rank', 0)
            score += min(net_income_growth_rank * 0.05, 5)

            # 💰 估值合理性验证 - 5%权重
            # PEG行业排名 (反向指标，越低越好)
            if pd.notna(row.get('price_earnings_growth_ttm_industry_rank')):
                peg_rank = row['price_earnings_growth_ttm_industry_rank']
                # PEG < 1 通常被认为是合理的
                if row.get('price_earnings_growth_ttm', 999) < 1.5:
                    score += 5
                elif row.get('price_earnings_growth_ttm', 999) < 2:
                    score += 3
                else:
                    score += 1
            else:
                # 如果没有PEG数据，用PE判断
                pe_rank = row.get('price_earnings_ttm_industry_rank', 50)
                pe_score = max(0, (100 - pe_rank) * 0.05)  # PE越低越好
                score += min(pe_score, 5)

        except (ValueError, TypeError):
            return 0

        return min(score, 100)

    # 应用专注评分
    normalized_data['focused_fcf_turnover_score'] = normalized_data.apply(
        calculate_focused_score, axis=1
    )

    # 计算核心组合指标
    normalized_data['fcf_turnover_composite'] = (
        normalized_data['free_cash_flow_margin_ttm_industry_rank'] * 0.6 +
        normalized_data['asset_turnover_current_industry_rank'] * 0.4
    )

    # 验证指标组合
    def calculate_validation_score(row):
        """计算验证指标得分，用于确认盈利质量和估值"""
        validation_score = 0

        # 盈利质量验证 (60%)
        op_margin_rank = row.get('operating_margin_industry_rank', 0)
        roe_rank = row.get('return_on_equity_industry_rank', 0)
        revenue_growth_rank = row.get('total_revenue_yoy_growth_ttm_industry_rank', 0)

        profitability_quality = (op_margin_rank + roe_rank + revenue_growth_rank) / 3
        validation_score += profitability_quality * 0.6

        # 财务健康验证 (20%)
        debt_rank = row.get('debt_to_equity_industry_rank', 50)
        financial_health = (100 - debt_rank)  # 负债越低越好
        validation_score += financial_health * 0.2

        # 估值验证 (20%)
        if pd.notna(row.get('price_earnings_growth_ttm')):
            peg = row['price_earnings_growth_ttm']
            if peg < 1:
                valuation_score = 100
            elif peg < 1.5:
                valuation_score = 80
            elif peg < 2:
                valuation_score = 60
            else:
                valuation_score = 40
        else:
            pe_rank = row.get('price_earnings_ttm_industry_rank', 50)
            valuation_score = 100 - pe_rank  # PE越低越好

        validation_score += valuation_score * 0.2

        return min(validation_score, 100)

    normalized_data['validation_score'] = normalized_data.apply(
        calculate_validation_score, axis=1
    )

    # 🎯 最终筛选条件 - 更加专注核心指标
    screening_criteria = (
        (normalized_data['focused_fcf_turnover_score'] >= 70) &  # 核心评分 >= 70
        (normalized_data['fcf_turnover_composite'] >= 70) &  # FCF周转组合排名前30%
        (normalized_data['validation_score'] >= 60) &  # 验证评分及格
        (normalized_data['market_cap_basic'] > 5000000000) &  # 市值 > 50亿
        (normalized_data['free_cash_flow_margin_ttm'] > 0.05) &  # FCF边际 > 5%
        (normalized_data['asset_turnover_current'] > 0.2) &  # 资产周转率 > 0.2
        (normalized_data['net_income_yoy_growth_ttm'] > 0) &  # 净利润增长为正
        (normalized_data['total_revenue_yoy_growth_ttm'] > 0)  # 收入增长为正
    )

    screened_stocks = normalized_data[screening_criteria].copy()

    if screened_stocks.empty:
        print("未找到符合核心策略的优质股票")
        return 0, pd.DataFrame()

    # 按核心评分和FCF周转组合排序
    screened_stocks = screened_stocks.sort_values(
        by=['focused_fcf_turnover_score', 'fcf_turnover_composite'],
        ascending=[False, False]
    )

    # 添加投资逻辑标签
    def get_investment_rationale(row):
        rationale = []

        fcf_margin_rank = row.get('free_cash_flow_margin_ttm_industry_rank', 0)
        turnover_rank = row.get('asset_turnover_current_industry_rank', 0)
        fcf_turnover_composite = row.get('fcf_turnover_composite', 0)
        peg = row.get('price_earnings_growth_ttm', 999)
        net_income_growth = row.get('net_income_yoy_growth_ttm', 0)

        if fcf_margin_rank >= 80:
            rationale.append("利润率领先")
        elif fcf_margin_rank >= 60:
            rationale.append("利润率优秀")

        if turnover_rank >= 80:
            rationale.append("资产周转领先")
        elif turnover_rank >= 60:
            rationale.append("资产周转优秀")

        if fcf_turnover_composite >= 80:
            rationale.append("现金流回报领先")
        elif fcf_turnover_composite >= 60:
            rationale.append("现金流回报优秀")

        if peg < 1:
            rationale.append("市盈增长率极具吸引力")
        elif peg < 1.5:
            rationale.append("市盈增长率合理")

        if net_income_growth > 0.2:
            rationale.append("高盈利增长")
        elif net_income_growth > 0.1:
            rationale.append("稳健盈利增长")

        return " | ".join(rationale) if rationale else "符合基础标准"

    screened_stocks['investment_rationale'] = screened_stocks.apply(
        get_investment_rationale, axis=1
    )

    # 选择输出列 - 更加专注核心指标
    output_columns = [
        'name', 'description', 'sector', 'industry', 'close', 'market_cap_basic',
        'focused_fcf_turnover_score', 'validation_score', 'investment_rationale',
        # 核心指标
        'free_cash_flow_margin_ttm', 'free_cash_flow_margin_ttm_industry_rank',
        'asset_turnover_current', 'asset_turnover_current_industry_rank',
        'fcf_turnover_composite',
        # 关键验证指标
        'operating_margin', 'return_on_equity',
        'net_income_yoy_growth_ttm', 'total_revenue_yoy_growth_ttm',
        'price_earnings_growth_ttm', 'debt_to_equity',
        # 技术指标
        'Recommend.All', 'Recommend.All|1W',
        'Recommend.MA', 'Recommend.MA|1W',
        'Recommend.Other', 'Recommend.Other|1W',
        'exchange'
    ]

    final_df = screened_stocks[output_columns]

    # 分析结果
    print(f"🎯 找到 {len(final_df)} 只符合FCF周转策略的中国股票")
    print("\n📊 核心筛选标准:")
    print("- FCF边际行业排名 + 资产周转率行业排名 (70%权重)")
    print("- 盈利质量和估值验证 (30%权重)")
    print("- FCF边际 > 5%, 资产周转率 > 0.2")
    print("- 收入和净利润增长为正")
    print("- 市值 > 50亿人民币")

    return len(final_df), final_df


def load_comment_data():
    """加载东方财富网千股千评数据"""
    pattern = r"stock_data/stock_comment_em_*.parquet"
    files = glob.glob(pattern)

    if files:
        # Sort files by timestamp in filename
        files.sort(key=lambda x: x.split('_')[-1].replace('.parquet', ''))
        latest_file = files[-1]
        stock_comment_em_df = pd.read_parquet(latest_file)
        print(f"Loaded latest comment data from {latest_file}")
    else:
        print("No existing comment data files found. Fetching new data...")
        # 获取东方财富网-千股千评
        stock_comment_em_df = ak.stock_comment_em()

        # 保存千股千评数据到本地parquet文件，注明时间戳
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        stock_comment_em_df = stock_comment_em_df.sort_values(by='目前排名')
        stock_comment_em_df.to_parquet(f"stock_comment_em_{timestamp}.parquet", index=False)
        print(f"Saved new comment data to stock_comment_em_{timestamp}.parquet")

    return stock_comment_em_df


def create_final_list():
    """生成最终股票列表并保存为parquet文件"""

    # 执行选股器
    profitable_count, profitable_df = focused_fcf_turnover_screener()

    if profitable_count == 0:
        print("没有找到符合条件的股票")
        return pd.DataFrame()

    # 格式化显示数据
    display_columns = [
        'name', 'description', 'sector', 'focused_fcf_turnover_score', 'investment_rationale',
        'free_cash_flow_margin_ttm', 'free_cash_flow_margin_ttm_industry_rank',
        'asset_turnover_current', 'asset_turnover_current_industry_rank',
        'fcf_turnover_composite', 'price_earnings_growth_ttm', 'market_cap_basic',
        'Recommend.All', 'Recommend.All|1W',
        'Recommend.MA', 'Recommend.MA|1W',
        'Recommend.Other', 'Recommend.Other|1W'
    ]

    display_df = profitable_df[display_columns].round(2)

    # 重命名列以便更好理解
    display_df = display_df.rename(columns={
        'free_cash_flow_margin_ttm': '现金流利润率',
        'free_cash_flow_margin_ttm_industry_rank': '现金流行业排名',
        'asset_turnover_current': '资产周转率',
        'asset_turnover_current_industry_rank': '资产周转率行业排名',
        'fcf_turnover_composite': '现金流回报率综合得分',
        'price_earnings_growth_ttm': '市盈增长比率',
        'market_cap_basic': '市值（亿元）',
        'focused_fcf_turnover_score': '基本面评分',
        'investment_rationale': '投资理由',
        'Recommend.All': '技术评级(日)',
        'Recommend.All|1W': '技术评级(周)',
        'Recommend.MA': '均线评级(日)',
        'Recommend.MA|1W': '均线评级(周)',
        'Recommend.Other': '震荡指标评级(日)',
        'Recommend.Other|1W': '震荡指标评级(周)'
    })

    # 市值转换为亿
    display_df['市值（亿元）'] = (display_df['市值（亿元）'] / 100000000).round(1)

    # 加载评论数据
    stock_comment_em_df = load_comment_data()

    # 合并数据
    combined_df = display_df.merge(
        stock_comment_em_df[['代码', '名称','最新价','主力成本', '换手率','机构参与度', '综合得分',
           '上升', '目前排名', '关注指数']].rename(columns={'代码': 'name'}),
        on='name',
        how='left'
    )

    # 映射行业到中文
    with open('stock_data/sector_translations.json', 'r', encoding='utf-8') as f:
        sector_map = json.load(f)

    combined_df['行业'] = combined_df['sector'].map(sector_map).fillna(combined_df['sector'])
    combined_df['代码'] = combined_df['name']

    # 计算最终组合权重
    combined_df['权重'] = combined_df['基本面评分'] * np.log(combined_df['市值（亿元）'])
    combined_df['权重'] = combined_df['权重'] / combined_df['权重'].sum()

    # 构建最终列表
    final_columns = ['代码','名称','行业','基本面评分','投资理由',
           '市值（亿元）','最新价','主力成本', '换手率','机构参与度',
           '上升', '目前排名', '关注指数', '技术评级(日)', '均线评级(日)', '震荡指标评级(日)',
           '技术评级(周)', '均线评级(周)', '震荡指标评级(周)', '权重']

    final_list = combined_df[final_columns].sort_values(by='权重', ascending=False)

    # 显示结果摘要
    print("\n" + "="*100)
    print("FCF周转策略优质股票推荐:")
    print("="*100)
    print(final_list.head(10).to_string(index=False))

    # 策略总结
    print(f"\n💡 策略总结:")
    print(f"- 总共找到 {len(final_list)} 只优质股票")
    print(f"- 平均基本面评分: {final_list['基本面评分'].mean():.1f}")
    print(f"- 平均市值: {final_list['市值（亿元）'].mean():.1f} 亿元")
    print(f"- 行业分布: {', '.join(final_list['行业'].unique())}")

    # 保存为parquet文件
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    filename = f"stock_data/cn_stock_screening_{timestamp}.parquet"
    final_list.to_parquet(filename, index=False)
    print(f"\n✅ 最终列表已保存到: {filename}")
    
    # 同时保存为JSON文件供网站使用
    json_filename = f"stock_data/cn_stock_screening_{timestamp}.json"
    final_list.to_json(json_filename, orient='records', force_ascii=False, indent=2)
    print(f"✅ JSON版本已保存到: {json_filename}")

    return final_list


if __name__ == "__main__":
    # 生成最终股票列表
    final_list = create_final_list()

