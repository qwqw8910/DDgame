// 各遊戲階段的顯示文字（純對照表，不依賴元件狀態）

export const GAME_PHASES = ['round1', 'round2', 'round1-result', 'round2-result', 'revealing']

// 左上階段卡標籤
export function phaseLabel(status) {
    return {
        'round1': '第一輪：提示中',
        'round1-result': '第一輪：作答中',
        'round2': '第二輪：提示中',
        'round2-result': '第二輪：作答中',
        'revealing': '答案揭曉',
        'finished': '本局結束',
    }[status] ?? '等待開始'
}

// 階段卡沒有進度條時的說明文字
export function phaseHintText(status, isGuesser) {
    switch (status) {
        case 'round1': return isGuesser ? '等待提示者完成第一輪線索' : '請輸入第一輪中文提示'
        case 'round1-result': return isGuesser ? '根據第一輪線索作答' : '等待猜題者作答'
        case 'round2': return isGuesser ? '等待提示者完成第二輪線索' : '請輸入第二輪中文提示'
        case 'round2-result': return isGuesser ? '根據兩輪線索完成最終作答' : '等待猜題者最終作答'
        case 'revealing': return '查看答案與 A/B 結果'
        case 'finished': return '房主可選擇下一局或結束'
        default: return '等待房主開始遊戲'
    }
}

// 轉場橫幅
export function phaseTitle(status) {
    return {
        'round1': '第一輪開始',
        'round1-result': '第一輪作答',
        'round2': '第二輪開始',
        'round2-result': '第二輪作答',
        'revealing': '答案揭曉',
        'finished': '本局結束',
    }[status] ?? '階段切換'
}

export function phaseDesc(status) {
    return {
        'round1': '提示者請輸入第一輪線索',
        'round1-result': '猜題者請根據第一輪線索作答',
        'round2': '提示者請輸入第二輪線索',
        'round2-result': '猜題者請根據兩輪線索完成最終作答',
        'revealing': '檢視答案與 A/B 判定結果',
        'finished': '房主可選擇繼續或結束遊戲',
    }[status] ?? ''
}

export const PHASE_KICKER = { round1: 'ROUND 1', round2: 'ROUND 2', finished: 'GAME SET' }

export function phaseCueKey(status) {
    return {
        'round1': 'phase-round1-start',
        'round1-result': 'phase-round1-answer',
        'round2': 'phase-round2-start',
        'round2-result': 'phase-round2-answer',
        'revealing': 'phase-reveal',
        'finished': 'phase-finished',
    }[status] ?? ''
}
