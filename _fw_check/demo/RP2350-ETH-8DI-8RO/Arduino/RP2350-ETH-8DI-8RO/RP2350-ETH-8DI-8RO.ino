#include "DEV_Config.h"
#include "Serial.h"

uint8_t buf[20] = {0};         
uint8_t rx_data_len = 0;
const uint8_t data_len = 8; 

void setup() {
    DEV_Module_Init();
    Serial_Init();
}

void loop() {
    if(uart_is_readable(UART_ID1))
    {
        if(RS485_cmd_Time > 1)      // Time greater than 1 millisecond
            DEV_Delay_ms(RS485_cmd_Time);
        else                        // Time is less than 1 millisecond 
            DEV_Delay_ms(1);
        rx_data_len = Serial_Read_Data(buf);
        if (rx_data_len == data_len)
        {
            int index = Compare_Commands(buf);
            if(index != -1)
            {
                Relay_Control(index);
                Beep();
            }
            else
            {
                Serial.print("Note : Non-instruction data was received - RS485 !\n");
            }
        }
        else
        {
            Serial.printf("Note : Non-instruction data was received .Number of bytes: %d - RS485 !\n",rx_data_len);
        }
        memset(buf,0, sizeof(buf));
    }

    delay(10);
}
