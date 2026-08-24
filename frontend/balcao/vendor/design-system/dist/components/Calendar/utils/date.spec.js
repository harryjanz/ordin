"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var enums_1 = require("../enums");
var getMonthDaysMock_1 = require("../mocks/getMonthDaysMock");
var getMonthListMock_1 = require("../mocks/getMonthListMock");
var date_1 = require("./date");
describe('date', function () {
    it('[getDaysLetter] should return the initial letters of the days of the week', function () {
        var days = (0, date_1.getDaysLetter)();
        expect(days).toEqual(['D', 'S', 'T', 'Q', 'Q', 'S', 'S']);
    });
    it('[getDayOfWeekInfo] should return the day of the week settings', function () {
        var daysOfWeek = (0, date_1.getDayOfWeekInfo)(new Date(2023, 0, 1));
        expect(daysOfWeek).toMatchObject({
            index: 0,
            letter: 'D',
            abbreviation: 'Dom',
        });
    });
    it('[getDefaultDate] should return today', function () {
        var dateNow = new Date();
        var dateToCompare = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate());
        var dateDefault = (0, date_1.getDefaultDate)();
        expect(dateDefault).toEqual(dateToCompare);
    });
    it('[getMonthList] should return to the settings for all months', function () {
        var monthConfigs = (0, date_1.getMonthList)(new Date(2023, 0, 1));
        expect(monthConfigs).toEqual(getMonthListMock_1.getMonthListMock);
    });
    it('[getMonthDays] should return an array with all days of a specific month', function () {
        var monthDates = (0, date_1.getMonthDays)(new Date(2023, 0, 1));
        expect(monthDates).toEqual(getMonthDaysMock_1.getMonthDaysMock);
    });
    it('[getMonthInfo] should return the settings for a specific month', function () {
        var month = (0, date_1.getMonthInfo)(new Date(2023, 0, 1));
        expect(month).toMatchObject({
            index: 0,
            name: 'Janeiro',
            abbreviation: 'Jan',
        });
    });
    it('[getFirstDayMonthInfo] should return the settings for the first day of the month', function () {
        var month = (0, date_1.getFirstDayMonthInfo)(new Date(2023, 0, 1));
        expect(month).toMatchObject({
            index: 0,
            letter: 'D',
            abbreviation: 'Dom',
        });
    });
    it('[getYearInterval] should return the years in a given range', function () {
        var years = (0, date_1.getYearInterval)(new Date(2023, 0, 1), new Date(2027, 0, 1));
        expect(years).toEqual([
            new Date(2023, 0, 1),
            new Date(2024, 0, 1),
            new Date(2025, 0, 1),
            new Date(2026, 0, 1),
            new Date(2027, 0, 1),
        ]);
    });
    it('[isValidDate] should return true with a valid date', function () {
        var isValid = (0, date_1.isValidDate)(new Date());
        expect(isValid).toBe(true);
    });
    it('[isValidDate] should return false with a invalid date', function () {
        var isValid = (0, date_1.isValidDate)(undefined);
        expect(isValid).toBe(false);
    });
    it('[isEqualDate] should return true if the dates are the same', function () {
        var isEqual = (0, date_1.isEqualDate)(new Date(2023, 0, 1), new Date(2023, 0, 1));
        expect(isEqual).toBe(true);
    });
    it('[isEqualDate] should return false if dates are not equal', function () {
        var isEqual = (0, date_1.isEqualDate)(new Date(2023, 0, 1), new Date(2024, 0, 1));
        expect(isEqual).toBe(false);
    });
    it('[isEqualMonth] should return true if the months are the same', function () {
        var isEqual = (0, date_1.isEqualMonth)(new Date(2023, 0, 1), new Date(2023, 0, 1));
        expect(isEqual).toBe(true);
    });
    it('[isEqualMonth] should return false if the months are not equal', function () {
        var isEqual = (0, date_1.isEqualMonth)(new Date(2023, 0, 1), new Date(2024, 1, 1));
        expect(isEqual).toBe(false);
    });
    it('[isEqualYear] should return true if the years are the same', function () {
        var isEqual = (0, date_1.isEqualYear)(new Date(2023, 0, 1), new Date(2023, 0, 1));
        expect(isEqual).toBe(true);
    });
    it('[isEqualYear] should return false if the years are not equal', function () {
        var isEqual = (0, date_1.isEqualYear)(new Date(2023, 0, 1), new Date(2024, 0, 1));
        expect(isEqual).toBe(false);
    });
    it('[isBeforeDate] should return true if the date is before the minimum date', function () {
        var isBefore = (0, date_1.isBeforeDate)(new Date(2023, 0, 1), new Date(2024, 0, 1));
        expect(isBefore).toBe(true);
    });
    it('[isBeforeDate] should return false if the date is not before the minimum date', function () {
        var isBefore = (0, date_1.isBeforeDate)(new Date(2023, 0, 1), new Date(2022, 0, 1));
        expect(isBefore).toBe(false);
    });
    it('[isAfterDate] should return true if the date is after the maximum date', function () {
        var isAfter = (0, date_1.isAfterDate)(new Date(2024, 0, 1), new Date(2023, 0, 1));
        expect(isAfter).toBe(true);
    });
    it('[isAfterDate] should return false if the date is not after the maximum date', function () {
        var isAfter = (0, date_1.isAfterDate)(new Date(2023, 0, 1), new Date(2024, 0, 1));
        expect(isAfter).toBe(false);
    });
    it('[isBeforeOrAfterDay] should return false if the date is not before the minimum date or after the maximum date', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterDay)(new Date(2023, 0, 2), new Date(2023, 0, 3), new Date(2023, 0, 1));
        expect(isBeforeOrAfter).toBe(false);
    });
    it('[isBeforeOrAfterDay] should return true if the date is before the minimum date', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterDay)(new Date(2023, 0, 1), new Date(2023, 0, 3), new Date(2023, 0, 2));
        expect(isBeforeOrAfter).toBe(true);
    });
    it('[isBeforeOrAfterDay] should return true if the date is after the maximum date', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterDay)(new Date(2023, 0, 3), new Date(2023, 0, 2), new Date(2023, 0, 1));
        expect(isBeforeOrAfter).toBe(true);
    });
    it('[isBeforeOrAfterMonth] should return false if the month is not before the minimum month or after the maximum month', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterMonth)(new Date(2023, 1, 1), new Date(2023, 3, 1), new Date(2023, 0, 1));
        expect(isBeforeOrAfter).toBe(false);
    });
    it('[isBeforeOrAfterMonth] should return true if the month is before the minimum month', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterMonth)(new Date(2023, 0, 1), new Date(2023, 2, 1), new Date(2023, 1, 1));
        expect(isBeforeOrAfter).toBe(true);
    });
    it('[isBeforeOrAfterMonth] should return true if the month is after the maximum month', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterMonth)(new Date(2023, 2, 1), new Date(2023, 1, 2), new Date(2023, 0, 1));
        expect(isBeforeOrAfter).toBe(true);
    });
    it('[isBeforeOrAfterYear] should return false if the year is not before the minimum year or after the maximum year', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterYear)(new Date(2023, 0, 1), new Date(2024, 0, 1), new Date(2022, 0, 1));
        expect(isBeforeOrAfter).toBe(false);
    });
    it('[isBeforeOrAfterYear] should return true if the year is before the minimum year', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterYear)(new Date(2023, 0, 1), new Date(2025, 0, 1), new Date(2024, 0, 1));
        expect(isBeforeOrAfter).toBe(true);
    });
    it('[isBeforeOrAfterYear] should return true if the year is after the maximum year', function () {
        var isBeforeOrAfter = (0, date_1.isBeforeOrAfterYear)(new Date(2024, 0, 1), new Date(2023, 0, 2), new Date(2022, 0, 1));
        expect(isBeforeOrAfter).toBe(true);
    });
    it('[formatDate] should return the date in string type with the format sent', function () {
        var date = (0, date_1.formatDate)(new Date(2023, 0, 1));
        expect(date).toEqual('01/01/2023');
    });
    it('[updateDate] should return the date in string type with the format sent', function () {
        var date = (0, date_1.updateDate)(new Date(2023, 0, 1), new Date(2023, 0, 2), enums_1.CalendarOptionsEnum.DAY);
        expect(date).toEqual(new Date(2023, 0, 2));
    });
    it('[updateDate] should update the day of the sent date', function () {
        var date = (0, date_1.updateDate)(new Date(2023, 0, 1), new Date(2023, 0, 2), enums_1.CalendarOptionsEnum.DAY);
        expect(date).toEqual(new Date(2023, 0, 2));
    });
    it('[updateDate] should update the month of the sent date', function () {
        var date = (0, date_1.updateDate)(new Date(2023, 0, 1), new Date(2023, 1, 1), enums_1.CalendarOptionsEnum.MONTH);
        expect(date).toEqual(new Date(2023, 1, 1));
    });
    it('[updateDate] should update the year of the sent date', function () {
        var date = (0, date_1.updateDate)(new Date(2023, 0, 1), new Date(2024, 0, 1), enums_1.CalendarOptionsEnum.YEAR);
        expect(date).toEqual(new Date(2024, 0, 1));
    });
});
