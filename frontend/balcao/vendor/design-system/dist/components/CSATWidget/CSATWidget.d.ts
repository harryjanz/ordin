import React from 'react';
export interface CSATWidgetProps {
    onFeedbackSubmit: (selectedScore: number, feedback: string) => void;
    title: string;
    modalTitle: string;
    finishMessageTitle: string;
    finishMessage: string;
    placeholderForScoreEqualOrBelowThree: string;
    placeholderForScoreEqualOrGreaterThanFour: string;
}
export declare const CSATWidget: React.FC<CSATWidgetProps>;
