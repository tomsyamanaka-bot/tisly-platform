/*****************************************************************************
* | File      	:   Serial.c
* | Author      :   Waveshare team
* | Function    :   Serial interface
* | Info        :
* | Date        :   2025-06-26
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documnetation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of theex Software, and to permit persons to  whom the Software is
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
#include <string.h>
#include "Serial.h"
#include "DEV_Config.h"

uint8_t data[][8] = {                                       // RP2350-ETH-8DI-8RO Control Command (RS485 receiving data)
  { 0x06, 0x05, 0x00, 0x01, 0x55, 0x00, 0xA2, 0xED },       // RP2350-ETH-8DI-8RO CH1 Toggle
  { 0x06, 0x05, 0x00, 0x02, 0x55, 0x00, 0x52, 0xED },       // RP2350-ETH-8DI-8RO CH2 Toggle
  { 0x06, 0x05, 0x00, 0x03, 0x55, 0x00, 0x03, 0x2D },       // RP2350-ETH-8DI-8RO CH3 Toggle
  { 0x06, 0x05, 0x00, 0x04, 0x55, 0x00, 0xB2, 0xEC },       // RP2350-ETH-8DI-8RO CH4 Toggle
  { 0x06, 0x05, 0x00, 0x05, 0x55, 0x00, 0xE3, 0x2C },       // RP2350-ETH-8DI-8RO CH5 Toggle
  { 0x06, 0x05, 0x00, 0x06, 0x55, 0x00, 0x13, 0x2C },       // RP2350-ETH-8DI-8RO CH6 Toggle
  { 0x06, 0x05, 0x00, 0x07, 0x55, 0x00, 0x42, 0xEC },       // RP2350-ETH-8DI-8RO CH7 Toggle
  { 0x06, 0x05, 0x00, 0x08, 0x55, 0x00, 0x72, 0xEF },       // RP2350-ETH-8DI-8RO CH8 Toggle
  { 0x06, 0x05, 0x00, 0xFF, 0xFF, 0x00, 0xBD, 0xBD },       // RP2350-ETH-8DI-8RO ALL ON
  { 0x06, 0x05, 0x00, 0xFF, 0x00, 0x00, 0xFC, 0x4D },       // RP2350-ETH-8DI-8RO ALL OFF
};
uint8_t send_data[][8] = {                                  // Modbus RTU Relay Control Command (RS485 send data)
  { 0x01, 0x05, 0x00, 0x00, 0x55, 0x00, 0xF2, 0x9A },       // Modbus RTU Relay CH1 Toggle
  { 0x01, 0x05, 0x00, 0x01, 0x55, 0x00, 0xA3, 0x5A },       // Modbus RTU Relay CH2 Toggle
  { 0x01, 0x05, 0x00, 0x02, 0x55, 0x00, 0x53, 0x5A },       // Modbus RTU Relay CH3 Toggle
  { 0x01, 0x05, 0x00, 0x03, 0x55, 0x00, 0x02, 0x9A },       // Modbus RTU Relay CH4 Toggle
  { 0x01, 0x05, 0x00, 0x04, 0x55, 0x00, 0xB3, 0x5B },       // Modbus RTU Relay CH5 Toggle
  { 0x01, 0x05, 0x00, 0x05, 0x55, 0x00, 0xE2, 0x9B },       // Modbus RTU Relay CH6 Toggle
  { 0x01, 0x05, 0x00, 0xFF, 0xFF, 0x00, 0xBC, 0x0A },       // Modbus RTU Relay ALL ON
  { 0x01, 0x05, 0x00, 0xFF, 0x00, 0x00, 0xFD, 0xFA },       // Modbus RTU Relay ALL OFF
};

double  transmission_time = 0;
double RS485_cmd_Time = 0;

void Serial_Init()
{
    uart_init(UART_ID1, BAUD_RATE);
    gpio_set_function(UART1_TX_PIN, GPIO_FUNC_UART);
    gpio_set_function(UART1_RX_PIN, GPIO_FUNC_UART);
    transmission_time = 10.0 / BAUD_RATE * 1000 ;
    RS485_cmd_Time = transmission_time*8;                    // 8:data length
}

void Serial_Send_Data(uint8_t* data, uint8_t length) 
{
    uart_write_blocking(UART_ID1, data, length);             // Send data from the RS485
}

int Serial_Read_Data(uint8_t* buf)
{
    int cnt;
    for (cnt = 0; uart_is_readable(UART_ID1); cnt++)
    {
        char get = uart_getc(UART_ID1);
        buf[cnt] = get;
    }
    return cnt;
}

int Compare_Commands(uint8_t* buf) 
{
    int index = -1;
    for(int i = 0; i < 10; i++)
    {
        if(memcmp(buf, data[i], 8) == 0)
        {
            index = i;
              break;
        }
    }
    return index;
}

void Relay_Control(uint8_t index)
{
    if(index < 8)
    {
        relay_status[index] = !relay_status[index]; 
        DEV_Digital_Write(RELAY1_PIN + index, relay_status[index]);
        printf("|***  Expansion channel %d %s***|\r\n", index+1, relay_status[index]?"ON":"OFF");
    }
    else if(index == 8)
    {
        memset(relay_status, 1, sizeof(relay_status));
        for(int i = 0; i < 8; i++)
        {
            DEV_Digital_Write(RELAY1_PIN + i, relay_status[i]);
        }
        printf("|***  Enable all extension channels ***|\r\n");
    }
    else if(index == 9)
    {
        memset(relay_status, 0, sizeof(relay_status));
        for(int i = 0; i < 8; i++)
        {
            DEV_Digital_Write(RELAY1_PIN + i, relay_status[i]);
        }
        printf("|***  Close all extension channels ***|\r\n");
    }
    else
        printf("Note : Non-control external device instructions !\r\n");
}
