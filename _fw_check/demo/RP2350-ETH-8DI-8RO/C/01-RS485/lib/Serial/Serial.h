/*****************************************************************************
* | File      	:   Serial.h
* | Author      :   Waveshare team
* | Function    :   Serial interface
* | Info        :
* | Date        :   2025-06-26
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documnetation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to  whom the Software is
# furished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS OR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
******************************************************************************/
#ifndef _SERIAL_H_
#define _SERIAL_H_

#include "pico/stdlib.h"
#include "stdio.h"

#define UART_ID1 uart1
#define BAUD_RATE 9600
#define UART1_TX_PIN 4
#define UART1_RX_PIN 5

#define Extension_CH1 0
#define Extension_CH2 1
#define Extension_CH3 2
#define Extension_CH4 3
#define Extension_CH5 4
#define Extension_CH6 5
#define Extension_ALL_ON  6
#define Extension_ALL_OFF 7

extern double transmission_time;
extern double RS485_cmd_Time;

void Serial_Init();
void Serial_Send_Data(uint8_t* data, uint8_t length);
int Serial_Read_Data(uint8_t* buf);
int Compare_Commands(uint8_t* buf);
void Relay_Control(uint8_t index);

#endif
